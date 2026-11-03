import { expect, test } from 'vitest';
import { validateAndRank } from '../src/domain/meals';
import { remainingQuantity } from '../src/domain/quantities';
import { summarize } from '../src/domain/analytics';
import { summarizeNearExpiry } from '../src/domain/expiry-insights';
import { ingredient, recipe, request, today } from '../tests/rules-fixtures';
import type { Outcome, QuantityEvent } from '../src/domain/model';

test('EV-CALC-01: four of six expiry points gives 66.6667 percent', () => {
  const items = [
    ingredient('a'),
    ingredient('b', { expiry_date: '2026-10-05' }),
    ingredient('c', { expiry_date: '2026-10-09' }),
  ];
  const [meal] = validateAndRank(
    [recipe(['a', 'c', 'water'])],
    items,
    [{ id: 'water', name: 'Water' }],
    request,
    [],
    today,
  );
  expect(meal.points).toBe(4);
  expect(meal.totalPoints).toBe(6);
  expect(meal.score).toBeCloseTo(66.6666667, 6);
});

test('EV-CALC-02: 500 g less 100 g used and 25 g waste leaves 375 g', () => {
  expect(remainingQuantity(500, 100, 25)).toBe(375);
});

test('EV-CALC-03: equal 20 percent waste shares keep gram and millilitre totals separate', () => {
  const events: QuantityEvent[] = [
    {
      id: 'g-use',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'used',
      amount: -100,
      before_quantity: 500,
      quantity: 400,
      created_at: '2026-10-01T02:00:00Z',
      synthetic: false,
    },
    {
      id: 'g-waste',
      item_id: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      kind: 'discarded',
      amount: -25,
      before_quantity: 400,
      quantity: 375,
      discard_reason: 'spoiled',
      created_at: '2026-10-01T02:01:00Z',
      synthetic: false,
    },
    {
      id: 'ml-use',
      item_id: 'milk',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'used',
      amount: -200,
      before_quantity: 500,
      quantity: 300,
      created_at: '2026-10-01T02:02:00Z',
      synthetic: false,
    },
    {
      id: 'ml-waste',
      item_id: 'milk',
      name: 'Milk',
      category: 'Dairy',
      unit: 'ml',
      kind: 'discarded',
      amount: -50,
      before_quantity: 300,
      quantity: 250,
      discard_reason: 'spoiled',
      created_at: '2026-10-01T02:03:00Z',
      synthetic: false,
    },
  ];
  const result = summarize([], '2026-10-01', '2026-10-01', events);
  expect(result.quantity.unitTotals.g).toMatchObject({ used: 100, discarded: 25 });
  expect(result.quantity.unitTotals.ml).toMatchObject({ used: 200, discarded: 50 });
  expect(result.quantity.wasteRates.g).toBe(0.2);
  expect(result.quantity.wasteRates.ml).toBe(0.2);
});

test('EV-CALC-04: near-expiry includes zero and three days, excludes four days', () => {
  const outcome: Outcome = {
    id: 'one',
    created_at: '2026-10-01T02:00:00Z',
    recipe: { name: 'Boundary meal' },
    synthetic: false,
    ingredients: [0, 3, 4].map((days, index) => ({
      id: `item-${days}`,
      name: `Item ${days}`,
      category: 'Vegetables',
      used: true,
      discarded: false,
      unit: 'g',
      used_amount: 100,
      expiry_date: ['2026-10-01', '2026-10-04', '2026-10-05'][index],
    })),
  };
  const result = summarizeNearExpiry([outcome], '2026-10-01', '2026-10-01', [
    { date: '2026-10-01', end: '2026-10-01' },
  ]);
  expect(result.count).toBe(2);
  expect(result.trackedUses).toBe(3);
  expect(result.records.map((record) => record.daysLeft)).toEqual([0, 3]);
});
