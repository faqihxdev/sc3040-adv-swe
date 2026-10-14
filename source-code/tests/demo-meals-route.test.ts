import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { request } from './rules-fixtures';
import { AppError } from '@/server/errors';
const mocks = vi.hoisted(() => ({ load: vi.fn(), saved: vi.fn(), rpc: vi.fn() }));
vi.mock('@/server/state', () => ({ loadState: mocks.load, AppError }));
vi.mock('@/server/demo-meals', () => ({ savedDemoMeals: mocks.saved }));
vi.mock('@/lib/supabase/server', () => ({ adminDb: () => ({ rpc: mocks.rpc }) }));
import { POST } from '@/app/api/meals/demo/route';
import { POST as confirm } from '@/app/api/confirm/route';
import { signMeal } from '@/server/meal-token';
import { recipe } from './rules-fixtures';

const state = { user: { id: 'alex' }, household: { id: 'demo' } };
afterEach(() => vi.unstubAllEnvs());
const makeRequest = (body: unknown, origin = 'http://127.0.0.1:3000') =>
  new Request('http://127.0.0.1:3000/api/meals/demo', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-secret-at-least-32-characters');
  mocks.load.mockResolvedValue(state);
  mocks.saved.mockReturnValue({ meals: [], message: '' });
  mocks.rpc.mockResolvedValue({ data: 'outcome', error: null });
});
test('validates input and origin before loading a signed-in household', async () => {
  expect((await POST(makeRequest(request, 'https://other.invalid'))).status).toBe(403);
  expect((await POST(makeRequest({ ...request, servings: 0 }))).status).toBe(400);
  expect(mocks.load).not.toHaveBeenCalled();
});
test('requires authentication and retains server authorization errors', async () => {
  mocks.load.mockRejectedValueOnce(new AppError('Sign in to continue.', 401));
  expect((await POST(makeRequest(request))).status).toBe(401);
  expect(mocks.saved).not.toHaveBeenCalled();
  mocks.saved.mockImplementationOnce(() => {
    throw new AppError('Unavailable.', 403);
  });
  expect((await POST(makeRequest(request))).status).toBe(403);
});
test('uses the supplied request, current server state and private no-store response', async () => {
  const response = await POST(makeRequest(request));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.saved).toHaveBeenCalledWith(state, request);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test('confirmation stores signed provenance with the normal transaction', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const token = signMeal(
    'alex',
    'demo',
    recipe([id]),
    [id],
    'session',
    { [id]: 'Rice' },
    'saved-demo',
  );
  const response = await confirm(
    makeRequest({
      token,
      changes: [{ id, version: 1, usedAmount: 100, discardedAmount: 0, discardReason: null }],
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    'confirm_meal',
    expect.objectContaining({ recipe_data: expect.objectContaining({ source: 'saved-demo' }) }),
  );
});
