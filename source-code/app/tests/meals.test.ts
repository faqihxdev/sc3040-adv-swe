import { describe, expect, test } from 'vitest';
import {
  eligibleItems,
  expiryPoints,
  todaySingapore,
  validateAndRank,
  validateChanges,
  matchesExclusion,
} from '@/domain/meals';
import { commandSchema, dateSchema, recipeSchema } from '@/domain/model';
import { ingredient, recipe, request, today } from './rules-fixtures';

describe('FR01 / PR03: deterministic eligibility and scoring', () => {
  test.each([
    ['2026-09-30', 0],
    ['2026-10-01', 3],
    ['2026-10-04', 3],
    ['2026-10-05', 2],
    ['2026-10-08', 2],
    ['2026-10-09', 1],
  ])('expiry %s contributes %i points', (expiry_date, points) => {
    expect(expiryPoints(ingredient('a', { expiry_date }), today)).toBe(points);
  });
  test('empty, deleted, past-date, excluded and manually omitted items are ineligible', () => {
    const items = [
      ingredient('valid'),
      ingredient('empty', { stock: 0 }),
      ingredient('deleted', { deleted: true }),
      ingredient('past', { expiry_date: '2026-09-30' }),
      ingredient('excluded', { name: 'Milk' }),
      ingredient('omitted'),
    ];
    expect(eligibleItems(items, ['Dairy'], ['omitted'], today).map((i) => i.id)).toEqual(['valid']);
  });
  test('four of six inventory points score 66.6667; staples add no points', () => {
    const items = [
      ingredient('a'),
      ingredient('b', { expiry_date: '2026-10-05' }),
      ingredient('c', { expiry_date: '2026-10-09' }),
    ];
    const [meal] = validateAndRank(
      [recipe(['a', 'c', 'staple-water'])],
      items,
      [{ id: 'staple-water', name: 'Water' }],
      request,
      [],
      today,
    );
    expect({ points: meal.points, total: meal.totalPoints, coverage: meal.coverage }).toEqual({
      points: 4,
      total: 6,
      coverage: 2,
    });
    expect(meal.score).toBeCloseTo(66.6667, 4);
  });
  test('equal scores prefer more tracked ingredients before shorter time', () => {
    const items = [
      ingredient('a'),
      ingredient('b', { expiry_date: '2026-10-05' }),
      ingredient('c', { expiry_date: '2026-10-09' }),
    ];
    const result = validateAndRank(
      [
        recipe(['a'], { name: 'Fast', cookingMinutes: 5 }),
        recipe(['b', 'c'], { name: 'More coverage', cookingMinutes: 45 }),
      ],
      items,
      [],
      request,
      [],
      today,
    );
    expect(result.map((m) => m.name)).toEqual(['More coverage', 'Fast']);
  });
  test('equal coverage prefers shorter time, then alphabetical name; returns at most three', () => {
    const result = validateAndRank(
      ['Zebra', 'Beta', 'Alpha', 'Slow'].map((name) =>
        recipe(['a'], { name, cookingMinutes: name === 'Slow' ? 30 : 20 }),
      ),
      [ingredient('a')],
      [],
      request,
      [],
      today,
    );
    expect(result.map((m) => m.name)).toEqual(['Alpha', 'Beta', 'Zebra']);
  });
  test('no eligible inventory returns no recommendation even with available staples', () => {
    expect(
      validateAndRank(
        [recipe(['staple-water'])],
        [],
        [{ id: 'staple-water', name: 'Water' }],
        request,
        [],
        today,
      ),
    ).toEqual([]);
  });
});

describe('FR02 / PR04: candidate validation', () => {
  test.each([
    recipe(['a'], { servings: 3 }),
    recipe(['a'], { steps: ['Only one step'] }),
    recipe(['a', 'a']),
    recipe(['unknown']),
    recipe(['a'], { summary: 'Add Food b.' }),
    recipe(['a'], { summary: 'Add butter.' }),
  ])('rejects a hard constraint violation without displaying it', (candidate) => {
    expect(
      validateAndRank(
        [candidate],
        [ingredient('a'), ingredient('b')],
        [],
        request,
        ['Dairy'],
        today,
      ),
    ).toEqual([]);
  });
  test('unavailable or excluded staples cannot be silently added', () => {
    expect(
      validateAndRank([recipe(['a', 'staple-oil'])], [ingredient('a')], [], request, [], today),
    ).toEqual([]);
    expect(
      validateAndRank(
        [recipe(['a', 'staple-milk'])],
        [ingredient('a')],
        [{ id: 'staple-milk', name: 'Milk' }],
        request,
        ['Dairy'],
        today,
      ),
    ).toEqual([]);
  });
  test('duplicate meal names are collapsed and a single valid candidate can be displayed', () => {
    const result = validateAndRank(
      [recipe(['a']), recipe(['a'], { name: ' TEST MEAL ' }), {}],
      [ingredient('a')],
      [],
      request,
      [],
      today,
    );
    expect(result).toHaveLength(1);
  });
  test('recognised exclusion aliases match case and plurals, not substrings', () => {
    expect(matchesExclusion('PRAWNS and cheese', ['Seafood'])).toBe(true);
    expect(matchesExclusion('Eggs', ['Vegan'])).toBe(true);
    expect(matchesExclusion('Eggplant', ['Egg'])).toBe(false);
  });
  test('estimated cooking time may exceed 30 minutes', () => {
    expect(recipeSchema.safeParse(recipe(['a'], { cookingMinutes: 45 })).success).toBe(true);
  });
});

describe('FR06 / FR07: explicit cooking changes', () => {
  const item = ingredient('a');
  test('defaults keep stock unchanged and used/discarded can both be true', () => {
    expect(() =>
      validateChanges([{ id: 'a', stock: 3, used: false, discarded: false }], [item]),
    ).not.toThrow();
    expect(() =>
      validateChanges([{ id: 'a', stock: 1, used: true, discarded: true }], [item]),
    ).not.toThrow();
  });
  test.each([
    [{ id: 'a', stock: 4, used: true, discarded: false }],
    [{ id: 'a', stock: 1, used: false, discarded: false }],
    [{ id: 'missing', stock: 1, used: true, discarded: false }],
    [
      { id: 'a', stock: 1, used: true, discarded: false },
      { id: 'a', stock: 1, used: true, discarded: false },
    ],
  ])('rejects contradictory, unavailable or duplicate changes', (...changes) => {
    expect(() => validateChanges(changes, [item])).toThrow();
  });
});

describe('FR04: dates and command inputs', () => {
  test.each(['', '2026-02-30', '2026-13-01', '1 Oct 2026'])(
    'rejects missing or invalid date %s',
    (date) => {
      expect(dateSchema.safeParse(date).success).toBe(false);
    },
  );
  test('accepts valid leap dates and past dates for records', () => {
    expect(dateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(
      commandSchema.safeParse({
        command: 'add_item',
        name: 'Rice',
        stock: 3,
        expiry_date: '2026-09-01',
        category: '',
        location: '',
      }).success,
    ).toBe(true);
  });
  test('Singapore midnight is independent of the host timezone', () => {
    expect(todaySingapore(new Date('2026-09-30T15:59:59Z'))).toBe('2026-09-30');
    expect(todaySingapore(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10-01');
  });
});
