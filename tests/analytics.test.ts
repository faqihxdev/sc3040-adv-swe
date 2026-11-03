import { expect, test } from 'vitest';
import { summarize, weeklyCounts } from '@/domain/analytics';
import type { Item, Outcome, OutcomeIngredient, QuantityEvent } from '@/domain/model';
import type { Unit } from '@/domain/quantities';
const rice: OutcomeIngredient = {
  id: 'rice',
  name: 'Rice',
  category: 'Grains',
  used: true,
  discarded: true,
  stock: 1,
  before_stock: 3,
};
function outcome(created_at: string, ingredients = [rice], synthetic = false): Outcome {
  return { id: created_at, created_at, ingredients, recipe: { name: 'Meal' }, synthetic };
}
test('FR08: Singapore period boundaries include both ends and exclude adjacent dates', () => {
  const result = summarize(
    [
      outcome('2026-09-30T15:59:59Z'),
      outcome('2026-09-30T16:00:00Z'),
      outcome('2026-10-01T15:59:59Z'),
      outcome('2026-10-01T16:00:00Z'),
    ],
    '2026-10-01',
    '2026-10-01',
  );
  expect({ meals: result.meals, used: result.used, discarded: result.discarded }).toEqual({
    meals: 2,
    used: 2,
    discarded: 2,
  });
});
test('FR09: counts use historical snapshots and exact trimmed, case-insensitive names', () => {
  const result = summarize(
    [
      outcome(
        '2026-10-01T00:00:00Z',
        [
          rice,
          { ...rice, name: ' rice ', used: false },
          { ...rice, name: 'Rice flour', category: '', used: false },
        ],
        true,
      ),
    ],
    '2026-10-01',
    '2026-10-02',
  );
  expect(result.ingredients.map((i) => i.count)).toEqual([2, 1]);
  expect(result.categories).toEqual([
    { name: 'Grains', count: 2 },
    { name: 'Uncategorised', count: 1 },
  ]);
  expect(result.synthetic).toBe(true);
  expect(result.daily).toEqual([
    { date: '2026-10-01', meals: 1, used: 1, discarded: 3 },
    { date: '2026-10-02', meals: 0, used: 0, discarded: 0 },
  ]);
});
test('FR08: empty confirmed history produces zero counts and an empty record list', () => {
  const result = summarize([], '2026-10-01', '2026-10-01');
  expect({
    meals: result.meals,
    used: result.used,
    discarded: result.discarded,
    synthetic: result.synthetic,
    records: result.records,
  }).toEqual({ meals: 0, used: 0, discarded: 0, synthetic: false, records: [] });
});
test('FR08: weekly groups start on Monday, including Sunday at the prior week end', () => {
  expect(
    weeklyCounts([
      { date: '2026-09-27', meals: 1, used: 2, discarded: 1 },
      { date: '2026-09-28', meals: 2, used: 3, discarded: 0 },
      { date: '2026-10-04', meals: 1, used: 1, discarded: 1 },
    ]),
  ).toEqual([
    { date: '2026-09-21', meals: 1, used: 2, discarded: 1 },
    { date: '2026-09-28', meals: 3, used: 4, discarded: 1 },
  ]);
});

test('quantity analytics use ledger amounts, preserve units, and calculate waste share', () => {
  const events: QuantityEvent[] = [
    {
      id: 'open',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'opening',
      amount: 1000,
      before_quantity: null,
      quantity: 1000,
      created_at: '2026-10-01T02:00:00Z',
      synthetic: false,
    },
    {
      id: 'use',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -200,
      before_quantity: 1000,
      quantity: 800,
      created_at: '2026-10-02T02:00:00Z',
      synthetic: false,
    },
    {
      id: 'waste',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -100,
      before_quantity: 800,
      quantity: 700,
      created_at: '2026-10-03T02:00:00Z',
      synthetic: false,
      discard_reason: 'past_date',
    },
    {
      id: 'milk',
      item_id: 'milk',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'discarded',
      amount: -300,
      before_quantity: 500,
      quantity: 200,
      created_at: '2026-10-03T02:00:00Z',
      synthetic: false,
      discard_reason: 'spoiled',
    },
  ];
  const result = summarize([], '2026-10-01', '2026-10-03', events);
  expect(result.quantity.units).toEqual(['g', 'ml']);
  expect(result.quantity.unitTotals.g.used).toBe(200);
  expect(result.quantity.unitTotals.g.discarded).toBe(100);
  expect(result.quantity.unitTotals.ml.discarded).toBe(300);
  expect(result.quantity.wasteRates.g).toBeCloseTo(1 / 3);
  expect(result.quantity.ingredients.find((row) => row.name === 'Rice')).toMatchObject({
    amount: 100,
    unit: 'g',
  });
  expect(result.quantity.reasons.map((row) => row.name)).toEqual(['spoiled', 'past_date']);
});

test('quantity analytics do not invent quantities for legacy outcomes', () => {
  const result = summarize([outcome('2026-10-01T00:00:00Z')], '2026-10-01', '2026-10-01');
  expect(result.quantity.hasData).toBe(false);
  expect(result.quantity.unitTotals.g).toBeUndefined();
  expect(result.used).toBe(1);
  expect(result.discarded).toBe(1);
});

const qevent = (
  patch: Partial<QuantityEvent> &
    Pick<
      QuantityEvent,
      'id' | 'item_id' | 'name' | 'category' | 'unit' | 'kind' | 'amount' | 'quantity'
    >,
) => ({
  before_quantity: null,
  synthetic: false,
  created_at: '2026-10-01T02:00:00Z',
  ...patch,
});
const current = (id: string, quantity: number | null, unit: Unit | null = 'g'): Item => ({
  id,
  name: id,
  quantity,
  unit,
  expiry_date: '2026-12-31',
  category: 'Other',
  location: 'Fridge',
  deleted: false,
  household_id: 'household',
  version: 1,
  updated_at: '2026-10-01T00:00:00Z',
  updated_by: null,
});

test('same ingredient and category stay separate across unit families', () => {
  const result = summarize([], '2026-10-01', '2026-10-10', [
    qevent({
      id: 'g',
      item_id: 'same-g',
      name: 'Beans',
      category: 'Protein',
      unit: 'g',
      kind: 'discarded',
      amount: -200,
      quantity: 0,
    }),
    qevent({
      id: 'piece',
      item_id: 'same-piece',
      name: 'Beans',
      category: 'Protein',
      unit: 'piece',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
    }),
  ]);
  expect(result.quantity.ingredients).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Beans', unit: 'g', amount: 200 }),
      expect.objectContaining({ name: 'Beans', unit: 'piece', amount: 2 }),
    ]),
  );
  expect(result.quantity.categories).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Protein', unit: 'g', amount: 200 }),
      expect.objectContaining({ name: 'Protein', unit: 'piece', amount: 2 }),
    ]),
  );
});

test('voided events do not affect outflow or pace, and opening is not restock', () => {
  const events = [
    qevent({
      id: 'open',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'opening',
      amount: 1000,
      quantity: 1000,
      created_at: '2026-09-20T02:00:00Z',
    }),
    qevent({
      id: 'used-1',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -100,
      quantity: 900,
      created_at: '2026-10-01T02:00:00Z',
    }),
    qevent({
      id: 'used-2',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -100,
      quantity: 800,
      created_at: '2026-10-08T02:00:00Z',
    }),
    qevent({
      id: 'used-3',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -100,
      quantity: 700,
      created_at: '2026-10-14T02:00:00Z',
    }),
    qevent({
      id: 'void',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -400,
      quantity: 400,
      created_at: '2026-10-09T02:00:00Z',
      voided: true,
    }),
  ];
  const result = summarize([], '2026-10-01', '2026-10-14', events, [current('rice', 700)]);
  expect(result.quantity.unitTotals.g.discarded).toBe(0);
  expect(result.quantity.unitTotals.g.restocked).toBe(0);
  expect(result.quantity.pace).toHaveLength(1);
});

test('waste rates preserve decimal proportions and sparse forecasts need 14 days and 3 use dates', () => {
  const events = [
    qevent({
      id: 'a',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'used',
      amount: -4,
      quantity: 96,
      created_at: '2026-10-01T02:00:00Z',
    }),
    qevent({
      id: 'b',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'used',
      amount: -4,
      quantity: 92,
      created_at: '2026-10-07T02:00:00Z',
    }),
    qevent({
      id: 'c',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 90,
      created_at: '2026-10-08T02:00:00Z',
    }),
  ];
  const short = summarize([], '2026-10-01', '2026-10-10', events, [current('x', 90)]);
  expect(short.quantity.wasteRates.g).toBeCloseTo(0.2);
  expect(short.quantity.pace).toHaveLength(0);
  const long = summarize(
    [],
    '2026-10-01',
    '2026-10-14',
    [
      ...events,
      qevent({
        id: 'd',
        item_id: 'x',
        name: 'X',
        category: 'Other',
        unit: 'g',
        kind: 'used',
        amount: -2,
        quantity: 86,
        created_at: '2026-10-14T02:00:00Z',
      }),
    ],
    [current('x', 86)],
  );
  expect(long.quantity.pace).toHaveLength(1);
});

test('current null quantity remains unknown and expiry uses reporting end anchor', () => {
  const items = [
    { ...current('unknown', null, null), name: 'Unknown', expiry_date: '2026-10-14' },
    { ...current('empty', 0), name: 'Empty', expiry_date: '2026-10-10' },
    { ...current('fresh', 100), name: 'Fresh', expiry_date: '2026-10-14' },
  ];
  const result = summarize([], '2026-10-01', '2026-10-10', [], items);
  expect(result.quantity.inventory.find((x) => x.id === 'unknown')?.quantity).toBeNull();
  expect(result.quantity.inventory.find((x) => x.id === 'fresh')?.daysToExpiry).toBe(4);
  expect(result.quantity.inventory.find((x) => x.id === 'empty')?.quantity).toBe(0);
});

test('trend data fills absent reporting days and weekly aggregation retains totals', () => {
  const result = summarize([], '2026-10-01', '2026-10-03', [
    qevent({
      id: 'one',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'used',
      amount: -5,
      quantity: 5,
      created_at: '2026-10-01T02:00:00Z',
    }),
  ]);
  expect(result.quantity.trend).toHaveLength(1);
  expect(result.daily).toHaveLength(3);
  expect(weeklyCounts(result.daily).reduce((sum, row) => sum + row.meals, 0)).toBe(0);
});

test('undone restock remains in historical balance order but not restock totals', () => {
  const events = [
    qevent({
      id: 'opening',
      item_id: 'flour',
      name: 'Flour',
      category: 'Grains',
      unit: 'g',
      kind: 'opening',
      amount: 100,
      quantity: 100,
      created_at: '2026-09-30T02:00:00Z',
      sequence: 1,
    }),
    qevent({
      id: 'restock',
      item_id: 'flour',
      name: 'Flour',
      category: 'Grains',
      unit: 'g',
      kind: 'restock',
      amount: 500,
      quantity: 600,
      created_at: '2026-10-01T02:00:00Z',
      sequence: 2,
      voided: true,
    }),
    qevent({
      id: 'undo',
      item_id: 'flour',
      name: 'Flour',
      category: 'Grains',
      unit: 'g',
      kind: 'undo',
      amount: -500,
      quantity: 100,
      created_at: '2026-10-01T02:00:00Z',
      sequence: 3,
    }),
  ];
  const result = summarize([], '2026-10-01', '2026-10-02', events, [current('flour', 100)]);
  expect(result.quantity.unitTotals.g.restocked).toBe(0);
  const rows = result.quantity.history.find((row) => row.itemId === 'flour')?.rows ?? [];
  expect(rows.map((row) => row.quantity)).toEqual([100, 600, 100]);
});

test('dashboard status counts and unit-scoped waste rows are actionable', () => {
  const events = [
    qevent({
      id: 'used',
      item_id: 'rice',
      name: ' Rice ',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -80,
      quantity: 120,
      created_at: '2026-10-02T02:00:00Z',
    }),
    qevent({
      id: 'discard-1',
      item_id: 'rice',
      name: 'rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -20,
      quantity: 100,
      created_at: '2026-10-03T02:00:00Z',
      discard_reason: 'past_date',
    }),
    qevent({
      id: 'discard-2',
      item_id: 'rice',
      name: 'rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -10,
      quantity: 90,
      created_at: '2026-10-04T02:00:00Z',
      discard_reason: 'past_date',
    }),
  ];
  const result = summarize([], '2026-10-01', '2026-10-10', events, [
    current('rice', 90),
    { ...current('milk', 500, 'ml'), expiry_date: '2026-10-13' },
    { ...current('old', 100, 'g'), expiry_date: '2026-09-30' },
    current('unknown', null, null),
  ]);
  expect(result.dashboard.inStock).toBe(3);
  expect(result.dashboard.expiringSoon).toBe(1);
  expect(result.dashboard.pastDate).toBe(1);
  expect(result.dashboard.unmeasured).toBe(1);
  expect(result.dashboard.wasteIncidents).toBe(2);
  expect(result.dashboard.wasteByIngredient[0]).toMatchObject({
    name: 'Rice',
    unit: 'g',
    used: 80,
    discarded: 30,
    discardEvents: 2,
  });
  expect(result.dashboard.wasteByIngredient[0].wasteRate).toBeCloseTo(30 / 110);
  expect(result.dashboard.repeatedWaste[0].avoidableDiscardEvents).toBe(2);
  expect(result.dashboard.discardReasons[0]).toMatchObject({
    name: 'past_date',
    count: 2,
    share: 1,
  });
});

test('dashboard keeps worked waste rates separate for grams, pieces, and millilitres', () => {
  const result = summarize([], '2026-10-01', '2026-10-10', [
    qevent({
      id: 'g-use',
      item_id: 'g',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -800,
      quantity: 200,
    }),
    qevent({
      id: 'g-waste',
      item_id: 'g',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -200,
      quantity: 0,
    }),
    qevent({
      id: 'p-use',
      item_id: 'p',
      name: 'Eggs',
      category: 'Protein',
      unit: 'piece',
      kind: 'used',
      amount: -8,
      quantity: 2,
    }),
    qevent({
      id: 'p-waste',
      item_id: 'p',
      name: 'Eggs',
      category: 'Protein',
      unit: 'piece',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
    }),
    qevent({
      id: 'm-use',
      item_id: 'm',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'used',
      amount: -200,
      quantity: 50,
    }),
    qevent({
      id: 'm-waste',
      item_id: 'm',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'discarded',
      amount: -50,
      quantity: 0,
    }),
  ]);
  expect(result.dashboard.wasteByIngredient.map((row) => row.wasteRate)).toEqual([0.2, 0.2, 0.2]);
});

test('dashboard excludes voided, outside-period, zero-outflow, opening, and restock rows', () => {
  const result = summarize([], '2026-10-01', '2026-10-10', [
    qevent({
      id: 'opening',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'opening',
      amount: 100,
      quantity: 100,
    }),
    qevent({
      id: 'restock',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'restock',
      amount: 100,
      quantity: 200,
    }),
    qevent({
      id: 'zero',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: 0,
      quantity: 200,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'old',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -40,
      quantity: 160,
      discard_reason: 'past_date',
      created_at: '2026-09-30T02:00:00Z',
    }),
    qevent({
      id: 'void',
      item_id: 'x',
      name: 'X',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -30,
      quantity: 170,
      discard_reason: 'spoiled',
      voided: true,
    }),
  ]);
  expect(result.dashboard.wasteIncidents).toBe(0);
  expect(result.dashboard.wasteByIngredient).toEqual([]);
  expect(result.dashboard.discardReasons).toEqual([]);
});

test('repeated waste recommends only repeated avoidable reasons with stock', () => {
  const events = [
    qevent({
      id: 'prep-1',
      item_id: 'a',
      name: 'A',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -5,
      quantity: 95,
      discard_reason: 'prep',
    }),
    qevent({
      id: 'prep-2',
      item_id: 'a',
      name: 'A',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -5,
      quantity: 90,
      discard_reason: 'prep',
    }),
    qevent({
      id: 'mix-1',
      item_id: 'b',
      name: 'B',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -5,
      quantity: 95,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'mix-2',
      item_id: 'b',
      name: 'B',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -5,
      quantity: 90,
      discard_reason: 'prep',
    }),
    qevent({
      id: 'good-1',
      item_id: 'c',
      name: 'C',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 98,
      discard_reason: 'past_date',
    }),
    qevent({
      id: 'good-2',
      item_id: 'c',
      name: 'C',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 96,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'd-use',
      item_id: 'd',
      name: 'D',
      category: 'Other',
      unit: 'g',
      kind: 'used',
      amount: -100,
      quantity: 97,
    }),
    qevent({
      id: 'd-1',
      item_id: 'd',
      name: 'D',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 96,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'd-2',
      item_id: 'd',
      name: 'D',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 95,
      discard_reason: 'past_date',
    }),
    qevent({
      id: 'd-3',
      item_id: 'd',
      name: 'D',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 94,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'e-1',
      item_id: 'e',
      name: 'E',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'e-2',
      item_id: 'e',
      name: 'E',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      discard_reason: 'past_date',
    }),
  ];
  const result = summarize([], '2026-10-01', '2026-10-10', events, [
    current('a', 90),
    current('b', 90),
    current('c', 96),
    current('d', 94),
    current('e', 0),
    { ...current('removed', 100), deleted: true },
    current('depleted', 0),
  ]);
  expect(result.dashboard.repeatedWaste.map((row) => row.name)).toEqual(['D', 'C', 'E']);
  expect(result.dashboard.repeatedWaste[0].avoidableDiscardEvents).toBe(3);
});

test('current status counts use end-date bounds and ignore period start', () => {
  const items = [
    { ...current('today', 10), expiry_date: '2026-10-03' },
    { ...current('seven', 10), expiry_date: '2026-10-10' },
    { ...current('eight', 10), expiry_date: '2026-10-11' },
    current('unknown', null),
    current('empty', 0),
    { ...current('deleted', 10), deleted: true },
  ];
  const short = summarize([], '2026-10-01', '2026-10-03', [], items);
  const long = summarize([], '2026-09-01', '2026-10-03', [], items);
  expect(short.dashboard).toMatchObject({
    inStock: 3,
    expiringSoon: 2,
    pastDate: 0,
    unmeasured: 1,
  });
  expect(long.dashboard).toMatchObject({ inStock: 3, expiringSoon: 2, pastDate: 0, unmeasured: 1 });
});

test('repeated waste remains actionable without stock and suppresses ambiguous batch ids', () => {
  const events = [
    qevent({
      id: 'removed-1',
      item_id: 'removed',
      name: 'Removed',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'removed-2',
      item_id: 'removed',
      name: 'Removed',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
      discard_reason: 'past_date',
    }),
    qevent({
      id: 'amb-1',
      item_id: 'amb',
      name: 'Ambiguous',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'amb-2',
      item_id: 'amb',
      name: 'Ambiguous',
      category: 'Other',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
      discard_reason: 'past_date',
    }),
  ];
  const result = summarize([], '2026-10-01', '2026-10-10', events, [
    { ...current('amb-1', 0), name: 'Ambiguous' },
    { ...current('amb-2', 0), name: 'Ambiguous', expiry_date: '2026-11-01' },
  ]);
  expect(result.dashboard.repeatedWaste.find((row) => row.name === 'Removed')?.itemId).toBeNull();
  expect(result.dashboard.repeatedWaste.find((row) => row.name === 'Ambiguous')?.itemId).toBeNull();
});

test('dashboard waste trend uses zero-filled daily buckets with avoidable and prep counts', () => {
  const result = summarize([], '2026-10-01', '2026-10-03', [
    qevent({
      id: 'a',
      item_id: 'a',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -2,
      quantity: 0,
      created_at: '2026-10-01T02:00:00Z',
      discard_reason: 'past_date',
    }),
    qevent({
      id: 'b',
      item_id: 'b',
      name: 'Eggs',
      category: 'Protein',
      unit: 'piece',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      created_at: '2026-10-01T03:00:00Z',
      discard_reason: 'prep',
    }),
    qevent({
      id: 'c',
      item_id: 'c',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      created_at: '2026-10-03T03:00:00Z',
    }),
    qevent({
      id: 'void',
      item_id: 'd',
      name: 'Bread',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      created_at: '2026-10-02T03:00:00Z',
      discard_reason: 'spoiled',
      voided: true,
    }),
  ]);
  expect(result.dashboard.wasteTrend).toEqual([
    { date: '2026-10-01', end: '2026-10-01', avoidable: 1, prep: 1, other: 0, total: 2 },
    { date: '2026-10-02', end: '2026-10-02', avoidable: 0, prep: 0, other: 0, total: 0 },
    { date: '2026-10-03', end: '2026-10-03', avoidable: 0, prep: 0, other: 1, total: 1 },
  ]);
  expect(result.dashboard.avoidableIncidents).toBe(1);
  expect(result.dashboard.avoidableIngredients).toEqual([{ name: 'Rice', unit: 'g', count: 1 }]);
  expect(result.dashboard.insight).toBe(
    'Rice (g) was the top avoidable discard, with 1 recorded incident.',
  );
});

test('dashboard waste trend uses clipped Monday weeks for longer periods', () => {
  const result = summarize([], '2026-10-07', '2026-10-17', [
    qevent({
      id: 'one',
      item_id: 'one',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      created_at: '2026-10-07T03:00:00Z',
      discard_reason: 'spoiled',
    }),
    qevent({
      id: 'two',
      item_id: 'two',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -1,
      quantity: 0,
      created_at: '2026-10-12T03:00:00Z',
      discard_reason: 'prep',
    }),
  ]);
  expect(result.dashboard.wasteTrend).toEqual([
    { date: '2026-10-07', end: '2026-10-11', avoidable: 1, prep: 0, other: 0, total: 1 },
    { date: '2026-10-12', end: '2026-10-17', avoidable: 0, prep: 1, other: 0, total: 1 },
  ]);
});
