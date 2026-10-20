import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/server/errors';
import { signMeal } from '@/server/meal-token';
import { ingredient, recipe } from './rules-fixtures';
const mocks = vi.hoisted(() => ({ load: vi.fn(), rpc: vi.fn() }));
vi.mock('@/server/state', () => ({ loadState: mocks.load, AppError }));
vi.mock('@/lib/supabase/server', () => ({ adminDb: () => ({ rpc: mocks.rpc }) }));
import { POST } from '@/app/api/cooking/route';

const id = randomUUID();
const sessionId = randomUUID();
const state = {
  user: { id: 'alex' },
  household: { id: 'home' },
  exclusions: [],
  items: [ingredient(id, { name: 'Rice', expiry_date: '2099-12-31' })],
};
const request = (data: unknown, origin = 'http://127.0.0.1:3000') =>
  new Request('http://127.0.0.1:3000/api/cooking', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
const start = () => ({
  action: 'start',
  token: signMeal('alex', 'home', recipe([id]), [id], sessionId, { [id]: 'Rice' }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-secret-at-least-32-characters');
  mocks.load.mockResolvedValue(state);
  mocks.rpc.mockImplementation(async (_name, input) => ({
    data: {
      id: input.session_id,
      expires_at: new Date(Date.now() + 7200000).toISOString(),
      recipe: input.recipe_data,
      meal_data: input.meal_data,
    },
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());

it('reserves only the authenticated ticket, returns a resumable session and disables caching', async () => {
  const response = await POST(request({ ...start(), recipe: { name: 'Forged' }, actor: 'sam' }));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).meal.name).toBe('Test meal');
  expect(mocks.rpc).toHaveBeenCalledWith(
    'start_cooking',
    expect.objectContaining({
      actor: 'alex',
      household: 'home',
      session_id: sessionId,
      recipe_data: expect.objectContaining({ name: 'Test meal' }),
    }),
  );
});
it('rejects invalid origin, invalid input, signed identity mismatches and expired tickets before mutations', async () => {
  expect((await POST(request(start(), 'https://other.invalid'))).status).toBe(403);
  expect((await POST(request({ action: 'cancel', sessionId: 'bad' }))).status).toBe(400);
  const wrong = signMeal('sam', 'home', recipe([id]), [id], sessionId);
  expect((await POST(request({ action: 'start', token: wrong }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('passes cancellation and renewal through the server identity and preserves stock-conflict errors', async () => {
  for (const action of ['renew', 'cancel']) {
    expect((await POST(request({ action, sessionId }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('manage_cooking', {
      actor: 'alex',
      household: 'home',
      session_id: sessionId,
      action,
    });
  }
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'PT409', message: 'Reserved portions changed.' },
  });
  const response = await POST(request(start()));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'Reserved portions changed.' });
  mocks.load.mockRejectedValueOnce(new AppError('Sign in to continue.', 401));
  expect((await POST(request(start()))).status).toBe(401);
});
