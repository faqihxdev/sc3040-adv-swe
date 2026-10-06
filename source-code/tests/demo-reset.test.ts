import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoSeed } from '@/domain/demo-data';
import { summarize } from '@/domain/analytics';
import { todaySingapore } from '@/domain/meals';
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
  it('keeps pork and alcoholic ingredients out of the inventory and history', () => {
    const seed = makeDemoSeed('2026-10-06', randomUUID);
    const names = [
      ...seed.items.map((item) => item.name),
      ...seed.events.map((event) => event.name),
      ...seed.outcomes.flatMap((outcome) => [
        outcome.recipe.name,
        ...outcome.ingredients.map((ingredient) => ingredient.name),
      ]),
    ];
    const excluded =
      /\b(pork|bacon|ham|lard|pancetta|prosciutto|alcohol|wine|beer|mirin|sake|shaoxing|sherry|brandy|rum|vodka|whisk(?:e)?y)\b/i;
    for (const name of names) expect(name).not.toMatch(excluded);
    expect(seed.items.find((item) => item.name === 'Minced chicken')).toMatchObject({
      quantity: 500,
      unit: 'g',
      category: 'Protein',
      location: 'Freezer',
    });
  });
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
    expect(next.outcomes[11].created_at).toBe('2026-09-11T04:00:00.000Z');
    expect(next.items.every((item) => !seed.items.some((old) => old.id === item.id))).toBe(true);
  });
  it('varies waste across the month while keeping recent setbacks and recurring hotspots', () => {
    const seed = makeDemoSeed('2026-10-01', randomUUID);
    const waste = seed.events.filter((event) => event.kind === 'discarded');
    const daysAgo = (event: (typeof waste)[number]) =>
      (Date.parse('2026-10-01') - Date.parse(todaySingapore(new Date(event.created_at)))) /
      86400000;
    const weeks = [3, 2, 1, 0].map((week) =>
      waste.filter((event) => Math.floor(daysAgo(event) / 7) === week),
    );
    const [oldest, , , recent] = weeks;
    expect(waste).toHaveLength(18);
    expect(weeks.map((week) => week.length)).toEqual([6, 4, 5, 3]);
    expect(waste.every((event) => daysAgo(event) >= 0 && daysAgo(event) < 28)).toBe(true);
    expect(new Set(waste.map((event) => daysAgo(event))).size).toBeLessThan(waste.length);
    const avoidable = (events: typeof waste) =>
      events.filter(
        (event) => event.discard_reason === 'spoiled' || event.discard_reason === 'past_date',
      );
    expect(avoidable(oldest)).toHaveLength(4);
    expect(avoidable(recent)).toHaveLength(2);
    expect(recent.some((event) => event.discard_reason === 'prep')).toBe(true);
    const grams = (events: typeof waste) =>
      events.filter((event) => event.unit === 'g').reduce((sum, event) => sum - event.amount, 0);
    expect(grams(oldest)).toBeGreaterThan(grams(recent));
    expect(new Set(waste.map((event) => event.unit))).toEqual(new Set(['g', 'ml', 'piece']));
    expect(new Set(waste.map((event) => event.discard_reason))).toEqual(
      new Set(['spoiled', 'past_date', 'prep', 'other']),
    );
    const prep = waste.filter((event) => event.discard_reason === 'prep');
    expect(
      prep.every((event) =>
        seed.outcomes.some(
          (outcome) =>
            todaySingapore(new Date(outcome.created_at)) ===
              todaySingapore(new Date(event.created_at)) &&
            outcome.ingredients.some((ingredient) => ingredient.id === event.item_id),
        ),
      ),
    ).toBe(true);
  });
  it.each(['2026-10-04', '2026-10-06', '2027-01-02', '2028-03-01'])(
    'keeps daily and weekly charts consistent after a reset on %s',
    (today) => {
      const seed = makeDemoSeed(today, randomUUID);
      const ago = (days: number) =>
        new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
      const monthly = summarize(seed.outcomes, ago(27), today, seed.events).dashboard;
      const weekly = summarize(seed.outcomes, ago(6), today, seed.events).dashboard;
      expect(monthly.wasteIncidents).toBe(18);
      expect(monthly.wasteTrend.reduce((sum, row) => sum + row.total, 0)).toBe(18);
      expect(monthly.discardReasons.reduce((sum, row) => sum + row.count, 0)).toBe(18);
      expect(weekly.wasteTrend).toHaveLength(7);
      expect(weekly.wasteIncidents).toBe(3);
      expect(weekly.avoidableIncidents).toBe(2);
      expect(weekly.wasteTrend.some((row) => row.total === 0)).toBe(true);
      for (const row of monthly.wasteTrend)
        expect(row.avoidable + row.prep + row.other).toBe(row.total);
      if (today === '2026-10-04')
        expect(monthly.wasteTrend.map((row) => row.total)).toEqual([6, 4, 5, 3]);
    },
  );
  it('keeps attention items alongside pantry staples', () => {
    const seed = makeDemoSeed('2026-10-01', randomUUID);
    expect(new Set(seed.items.map((item) => item.unit))).toEqual(new Set(['g', 'ml', 'piece']));
    expect(seed.items.find((item) => item.name === 'Bean sprouts')).toMatchObject({
      quantity: 180,
      unit: 'g',
      expiry_date: '2026-10-02',
    });
    expect(seed.items.find((item) => item.name === 'Rice')).toMatchObject({
      quantity: 3200,
      unit: 'g',
      location: 'Pantry',
    });
    expect(seed.events.some((event) => event.kind === 'restock')).toBe(true);
    expect(
      seed.events.filter((event) => event.name === 'Minced chicken').map((event) => event.kind),
    ).toEqual(['opening']);
  });
  it('balances every event and chains each history into the current measured inventory', () => {
    const seed = makeDemoSeed('2026-10-01', randomUUID);
    for (const item of seed.items) {
      const records = seed.events
        .filter((event) => event.item_id === item.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      expect(records[0]).toMatchObject({ kind: 'opening', before_quantity: null, unit: item.unit });
      expect(records[0].amount).toBe(records[0].quantity);
      records.slice(1).forEach((record, index) => {
        expect(record.before_quantity).toBe(records[index].quantity);
        expect(record.quantity).toBeCloseTo(record.before_quantity! + record.amount, 2);
        expect(record.quantity).toBeGreaterThanOrEqual(0);
        expect(record.unit).toBe(item.unit);
      });
      expect(records.at(-1)?.quantity).toBe(item.quantity);
    }
    expect(
      seed.events.filter((event) => event.name === 'Bean sprouts' && event.kind === 'discarded'),
    ).toHaveLength(3);
    expect(seed.events.every((event) => event.synthetic)).toBe(true);
    for (const outcome of seed.outcomes)
      for (const ingredient of outcome.ingredients) {
        expect(ingredient.quantity).toBeCloseTo(
          ingredient.before_quantity! - ingredient.used_amount!,
          2,
        );
        expect(
          seed.events.some(
            (event) =>
              event.item_id === ingredient.id &&
              event.created_at === outcome.created_at &&
              event.kind === 'used' &&
              -event.amount === ingredient.used_amount,
          ),
        ).toBe(true);
      }
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
    expect(input[1].events_data.length).toBeGreaterThan(40);
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
