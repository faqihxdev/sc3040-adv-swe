import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoSeed } from '@/domain/demo-data';
import { itemInput } from '@/domain/model';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ load: vi.fn(), rpc: vi.fn() }));
vi.mock('@/server/state', async () => ({
  loadState: mocks.load,
  ...(await import('@/server/errors')),
}));
vi.mock('@/lib/supabase/server', () => ({ adminDb: () => ({ rpc: mocks.rpc }) }));
import { POST } from '@/app/api/demo/reset/route';
import { AppError } from '@/server/errors';
const householdId = '11111111-1111-4111-8111-111111111111';
const state = {
  user: { id: 'actor' },
  household: { id: householdId, version: 2 },
  members: [],
  demoResetEnabled: true,
};
const request = (patch = {}, origin = 'http://127.0.0.1:3000') =>
  new Request('http://127.0.0.1:3000/api/demo/reset', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ householdId, version: 2, confirmation: 'RESET', ...patch }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('DEMO_HOUSEHOLD_ID', householdId);
  mocks.load.mockResolvedValue(state);
  mocks.rpc.mockResolvedValue({ error: null });
});
describe('demo seed', () => {
  it('creates valid inventory, fresh IDs and linked synthetic history with rolling dates', () => {
    const seed = makeDemoSeed('2026-10-01', randomUUID);
    expect(seed.items).toHaveLength(40);
    expect(seed.outcomes).toHaveLength(14);
    seed.items.forEach((item) => expect(itemInput.safeParse(item).success).toBe(true));
    expect(seed.items.find((item) => item.name === 'Bean sprouts')?.expiry_date).toBe('2026-10-02');
    expect(
      seed.outcomes.every(
        (outcome) =>
          outcome.synthetic &&
          outcome.ingredients.every((ingredient) =>
            seed.items.some((item) => item.id === ingredient.id),
          ),
      ),
    ).toBe(true);
    const next = makeDemoSeed('2026-10-02', randomUUID);
    expect(next.items.find((item) => item.name === 'Bean sprouts')?.expiry_date).toBe('2026-10-03');
    expect(next.outcomes[0].created_at).toBe('2026-10-02T04:00:00.000Z');
    expect(next.outcomes[11].created_at).toBe('2026-09-21T04:00:00.000Z');
    expect(next.items.every((item) => !seed.items.some((old) => old.id === item.id))).toBe(true);
  });
  it('supports rice, noodle, curry, pasta, vegetarian and breakfast meals', () => {
    const seed = makeDemoSeed('2026-10-01', randomUUID);
    expect(seed.items.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Rice',
        'Pasta',
        'Bread',
        'Oats',
        'Firm tofu',
        'Chicken breast',
        'Canned tuna',
        'Bananas',
      ]),
    );
    expect(new Set(seed.items.map((item) => item.name)).size).toBe(seed.items.length);
    expect(new Set(seed.outcomes.map((outcome) => outcome.recipe.name)).size).toBe(12);
    const chickenRice = seed.outcomes.find(
      (outcome) => outcome.recipe.name === 'Hainanese-style chicken rice',
    );
    expect(chickenRice?.ingredients.map((ingredient) => ingredient.name)).toEqual(
      expect.arrayContaining([
        'Rice',
        'Chicken breast',
        'Ginger',
        'Garlic',
        'Chicken stock',
        'Cucumber',
      ]),
    );
    expect(seed.outcomes.every((outcome) => outcome.ingredients.length > 0)).toBe(true);
  });
});
describe('demo reset endpoint', () => {
  it('rejects foreign origins, missing confirmation and disabled/unallowlisted demos before writing', async () => {
    expect((await POST(request({}, 'https://evil.example'))).status).toBe(403);
    expect((await POST(request({ confirmation: '' }))).status).toBe(400);
    vi.stubEnv('DEMO_MODE', 'false');
    expect((await POST(request())).status).toBe(403);
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_HOUSEHOLD_ID', '22222222-2222-4222-8222-222222222222');
    expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires authentication, owner access and the same household', async () => {
    mocks.load.mockRejectedValueOnce(new AppError('Sign in.', 401));
    expect((await POST(request())).status).toBe(401);
    mocks.load.mockResolvedValueOnce({ ...state, demoResetEnabled: false });
    expect((await POST(request())).status).toBe(403);
    expect(
      (await POST(request({ householdId: '22222222-2222-4222-8222-222222222222' }))).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses one scoped RPC and preserves the version conflict without retry', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: 'PT409', message: 'Household changed.' } });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const input = mocks.rpc.mock.calls[0];
    expect(input[0]).toBe('reset_demo');
    expect(input[1]).toMatchObject({ actor: 'actor', household: householdId, expected_version: 2 });
    expect(input[1].items_data).toHaveLength(40);
    expect(input[1].outcomes_data).toHaveLength(14);
  });
  it('returns refreshed state without caching, and reports a saved reset when refresh fails', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    mocks.load
      .mockResolvedValueOnce(state)
      .mockRejectedValueOnce(new AppError('Unavailable.', 503));
    const failedRefresh = await POST(request());
    expect(failedRefresh.status).toBe(503);
    expect((await failedRefresh.json()).error).toContain('Demo data was reset');
  });
});
