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
import { demoIngredients } from '@/domain/demo-data';

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
    ['Coconut milk', 'Milk', 'Warm the coconut milk.'],
    ['Spring onions', 'Onion', 'Chop the spring onions.'],
    ['Thick rice noodles', 'Rice', 'Boil the thick rice noodles.'],
    ['Thick rice noodles', 'Rice', 'Boil the rice noodles.'],
    ['Cooking oil', 'Oil', 'Heat the cooking oil.'],
  ])('keeps a listed %s distinct from unlisted %s', (name, unusedName, step) => {
    const items = [ingredient('used', { name }), ingredient('unused', { name: unusedName })];
    const candidate = recipe(['used'], { steps: [step, 'Stir.', 'Cook.', 'Serve.'] });
    expect(validateAndRank([candidate], items, [], request, [], today)).toHaveLength(1);
  });
  test('matches whole ingredient words rather than oil inside boil', () => {
    expect(
      validateAndRank(
        [recipe(['rice'], { steps: ['Boil.', 'Stir.', 'Cook.', 'Serve.'] })],
        [ingredient('rice', { name: 'Rice' }), ingredient('oil', { name: 'Oil' })],
        [],
        request,
        [],
        today,
      ),
    ).toHaveLength(1);
  });
  test.each([
    ['Coconut milk', 'Milk', 'Warm coconut milk, then add milk.'],
    ['Milk', 'Coconut milk', 'Warm the coconut milk.'],
    ['Spring onions', 'Onion', 'Chop spring onions and onions.'],
    ['Rice', 'Thick rice noodles', 'Boil the thick rice noodles.'],
    ['Chicken rice', 'Rice noodles', 'Serve chicken rice noodles.'],
  ])('still rejects an actual unlisted ingredient beside %s', (name, unusedName, step) => {
    expect(
      validateAndRank(
        [recipe(['used'], { steps: [step, 'Stir.', 'Cook.', 'Serve.'] })],
        [ingredient('used', { name }), ingredient('unused', { name: unusedName })],
        [],
        request,
        [],
        today,
      ),
    ).toEqual([]);
  });
  test('identical ingredient labels use the explicitly listed ID', () => {
    const items = [ingredient('used', { name: 'Rice' }), ingredient('unused', { name: 'Rice' })];
    const [meal] = validateAndRank(
      [recipe(['used'], { steps: ['Boil the rice.', 'Stir.', 'Cook.', 'Serve.'] })],
      items,
      [],
      request,
      [],
      today,
    );
    expect(meal?.trackedItems.map((item) => item.id)).toEqual(['used']);
  });
  test('retains three feasible meals with the full 40-ingredient demo inventory', () => {
    const items = demoIngredients.map(([name, stock], index) =>
      ingredient(`demo-${index}`, { name, stock }),
    );
    const staples = [
      { id: 'water', name: 'Water' },
      { id: 'oil', name: 'Cooking oil' },
    ];
    const id = (name: string) => [...items, ...staples].find((item) => item.name === name)!.id;
    const laksa = recipe(
      [
        'Thick rice noodles',
        'Laksa paste',
        'Coconut milk',
        'Prawns',
        'Tofu puffs',
        'Bean sprouts',
        'Laksa leaves',
        'Water',
      ].map(id),
      {
        name: 'Prawn and Tofu Puff Laksa Noodles',
        summary:
          'Rice noodles in a coconut laksa broth with prawns, tofu puffs, bean sprouts and laksa leaves.',
        steps: [
          'Prepare the rice noodles.',
          'Stir laksa paste with water.',
          'Add coconut milk, tofu puffs and prawns.',
          'Serve over bean sprouts with laksa leaves.',
        ],
      },
    );
    const friedRice = recipe(['Rice', 'Eggs', 'Spring onions', 'Cooking oil'].map(id), {
      name: 'Egg fried rice',
      steps: [
        'Prepare rice.',
        'Chop spring onions.',
        'Heat cooking oil and scramble eggs.',
        'Stir in rice and spring onions.',
      ],
    });
    const pasta = recipe(['Pasta', 'Canned tuna', 'Tomato passata'].map(id), {
      name: 'Tomato tuna pasta',
      steps: ['Prepare pasta.', 'Warm tomato passata.', 'Fold in canned tuna.', 'Toss and serve.'],
    });
    expect(
      validateAndRank([laksa, friedRice, pasta], items, staples, request, [], today),
    ).toHaveLength(3);
  });
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
