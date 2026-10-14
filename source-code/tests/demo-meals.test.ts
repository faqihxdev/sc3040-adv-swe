import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeDemoSeed } from '@/domain/demo-data';
import { commonStaples } from '@/domain/staples';
import { recipeSchema, type AppState, type MealRequest } from '@/domain/model';
import { savedDemoMeals } from '@/server/demo-meals';
import { verifyMeal } from '@/server/meal-token';

const request: MealRequest = {
  servings: 2,
  mealType: 'Dinner',
  preferences: 'Use Bean sprouts if possible',
  staples: commonStaples,
  excludedIds: [],
};
let state: AppState;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T02:00:00Z'));
  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('DEMO_HOUSEHOLD_ID', 'demo');
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-secret-at-least-32-characters');
  state = {
    user: { id: 'alex', email: 'alex@tests.invalid', display_name: 'Alex' },
    household: { id: 'demo', name: 'Demo', owner_id: 'alex', version: 1, locations: [] },
    items: makeDemoSeed('2026-10-14', randomUUID).items.map((i) => ({
      ...i,
      household_id: 'demo',
      version: 1,
      deleted: false,
      updated_at: '',
      updated_by: null,
    })),
    members: [],
    activity: [],
    outcomes: [],
    exclusions: ['Mushrooms'],
    aiEnabled: false,
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test('saved set fits the script, works without AI, and issues fresh current-stock tickets', () => {
  const before = structuredClone(state);
  const result = savedDemoMeals(state, request);
  expect(result.meals).toHaveLength(3);
  expect(result.meals[0].name).toBe('Prawn and Bean Sprout Thick Rice Noodles');
  expect(result.meals[0]).toMatchObject({
    points: 13,
    totalPoints: 67,
    coverage: 6,
    source: 'saved-demo',
  });
  expect(result.meals[0].trackedItems.find((i) => i.name === 'Bean sprouts')?.quantity).toBe(180);
  const tickets = result.meals.map((m) => verifyMeal(m.token, 'alex', 'demo'));
  expect(new Set(tickets.map((t) => t.id)).size).toBe(1);
  expect(tickets.every((t) => t.source === 'saved-demo')).toBe(true);
  expect(tickets[0].expires).toBe(Date.now() + 86400000);
  for (const meal of result.meals) {
    expect(recipeSchema.safeParse(meal).success).toBe(true);
    expect(readFileSync(`public${meal.savedImage}`).subarray(0, 4).toString()).toBe('RIFF');
    expect(meal.trackedItems.every((i) => state.items.some((item) => item.id === i.id))).toBe(true);
  }
  state.items = state.items.map((i) => ({ ...i, id: randomUUID() }));
  expect(savedDemoMeals(state, request).meals).toHaveLength(3);
  expect(state.items.map((i) => i.quantity)).toEqual(before.items.map((i) => i.quantity));
  expect(savedDemoMeals(state, request).meals[0].token).not.toBe(result.meals[0].token);
});

test('restricts fallback to the configured demo household and allows its members', () => {
  state.user.id = 'sam';
  expect(savedDemoMeals(state, request).meals).toHaveLength(3);
  state.household!.id = 'other';
  expect(() => savedDemoMeals(state, request)).toThrow('unavailable');
  state.household = null;
  expect(() => savedDemoMeals(state, request)).toThrow('unavailable');
  vi.stubEnv('DEMO_MODE', 'false');
  expect(() => savedDemoMeals(state, request)).toThrow('unavailable');
});

test.each([{ servings: 3 }, { mealType: 'Lunch' as const }, { preferences: 'No spicy dishes' }])(
  'does not silently override a different request: %j',
  (changes) => {
    expect(() => savedDemoMeals(state, { ...request, ...changes })).toThrow('Dinner for 2');
  },
);

test.each([
  { quantity: 0 },
  { quantity: 99 },
  { unit: 'ml' as const },
  { deleted: true },
  { expiry_date: '2026-10-13' },
])('filters unavailable bean sprouts: %j', (changes) => {
  Object.assign(
    state.items.find((i) => i.name === 'Bean sprouts')!,
    changes,
  );
  const result = savedDemoMeals(state, request);
  expect(result.meals).toHaveLength(2);
  expect(result.message).toContain('2 saved recipes');
  expect(result.meals.some((m) => m.name.includes('Bean Sprout'))).toBe(false);
});

test('honours saved exclusions, request exclusions and removed staples', () => {
  state.exclusions = ['seafood'];
  expect(savedDemoMeals(state, request).meals.map((m) => m.name)).toEqual([
    'Chicken Curry with Rice',
  ]);
  state.exclusions = ['Mushrooms'];
  const sprouts = state.items.find((i) => i.name === 'Bean sprouts')!;
  expect(savedDemoMeals(state, { ...request, excludedIds: [sprouts.id] }).meals).toHaveLength(2);
  expect(() => savedDemoMeals(state, { ...request, staples: ['Salt'] })).toThrow(
    'No saved demo recipes',
  );
  state.items = [];
  expect(() => savedDemoMeals(state, request)).toThrow('No saved demo recipes');
});

test('selects a sufficient earliest-expiring batch and recalculates scores', () => {
  const sprouts = state.items.find((i) => i.name === 'Bean sprouts')!;
  const duplicate = { ...sprouts, id: randomUUID(), quantity: 5, expiry_date: '2026-10-14' };
  state.items.unshift(duplicate);
  const meal = savedDemoMeals(state, request).meals[0];
  expect(meal.trackedItems.some((i) => i.id === sprouts.id)).toBe(true);
  expect(meal.trackedItems.some((i) => i.id === duplicate.id)).toBe(false);
  expect(meal.totalPoints).toBe(70);
  expect(meal.score).toBeCloseTo((100 * 13) / 70);
});
