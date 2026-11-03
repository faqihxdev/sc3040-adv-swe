import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AppState } from '@/domain/model';
import { availableItems, reservedAmount } from '@/domain/reservations';
import { cookingFromTicket, restoreCookingSession } from '@/server/cooking';
import { signMeal, verifyMeal } from '@/server/meal-token';
import { ingredient, recipe } from './rules-fixtures';

const itemId = randomUUID();
const sessionId = randomUUID();
const now = Date.parse('2026-10-20T02:00:00Z');
function fixture(): AppState {
  return {
    user: { id: 'alex', email: 'alex@tests.invalid', display_name: 'Alex' },
    household: { id: 'home', name: 'Home', owner_id: 'alex', version: 1, locations: [] },
    members: [],
    activity: [],
    outcomes: [],
    exclusions: [],
    aiEnabled: false,
    items: [ingredient(itemId, { name: 'Rice', quantity: 500, expiry_date: '2099-12-31' })],
    reservations: [
      {
        itemId,
        sessionId,
        userId: 'alex',
        amount: 100.1,
        expiresAt: new Date(now + 7200000).toISOString(),
      },
      {
        itemId,
        sessionId: 'other',
        userId: 'sam',
        amount: 200.2,
        expiresAt: new Date(now + 7200000).toISOString(),
      },
      {
        itemId,
        sessionId: 'expired',
        userId: 'sam',
        amount: 500,
        expiresAt: new Date(now - 1).toISOString(),
      },
    ],
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-secret-at-least-32-characters');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('separates physical stock from exact available portions, ignores expiry and includes own held amount at confirmation', () => {
  const state = fixture();
  expect(reservedAmount(itemId, state.reservations)).toBe(300.3);
  expect(availableItems(state)[0].quantity).toBe(199.7);
  expect(availableItems(state, sessionId)[0].quantity).toBe(299.8);
  expect(state.items[0].quantity).toBe(500);
  expect(
    availableItems({ items: [ingredient('unknown', { quantity: null })] })[0].quantity,
  ).toBeNull();
});

it('rebinds the signed recipe on start and resume without trusting client recipe metadata', () => {
  const state = fixture();
  const token = signMeal('alex', 'home', recipe([itemId]), [itemId], sessionId, {
    [itemId]: 'Rice',
  });
  const { meal, recipe: storedRecipe } = cookingFromTicket(token, state);
  expect(meal.trackedItems[0].quantity).toBe(299.8);
  expect(meal.ingredientNames[itemId]).toBe('Rice');
  const session = restoreCookingSession(
    {
      id: sessionId,
      expires_at: new Date(now + 7200000).toISOString(),
      recipe: storedRecipe,
      meal_data: meal,
    },
    'alex',
    'home',
  );
  expect(session.meal.sessionId).toBe(sessionId);
  expect(verifyMeal(session.meal.token, 'alex', 'home').id).toBe(sessionId);
  expect(() => verifyMeal(token, 'sam', 'home')).toThrow();
});

it('rejects changed exclusions and unavailable tracked stock at start', () => {
  const state = fixture();
  const token = signMeal('alex', 'home', recipe([itemId]), [itemId], sessionId);
  expect(() => cookingFromTicket(token, { ...state, exclusions: ['Rice'] })).toThrow(/exclusions/);
  expect(() => cookingFromTicket(token, { ...state, items: [] })).toThrow(/stock/);
});
