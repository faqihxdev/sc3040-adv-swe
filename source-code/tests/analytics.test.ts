import { expect, test } from 'vitest';
import { summarize, weeklyCounts } from '@/domain/analytics';
import type { Outcome, OutcomeIngredient } from '@/domain/model';
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
