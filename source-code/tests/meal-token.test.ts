import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { signMeal, verifyMeal } from '@/server/meal-token';
import { recipe } from './rules-fixtures';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-key-with-at-least-32-characters');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
test('FR03: a valid session retains the recipe, tracked IDs and session ID', () => {
  const token = signMeal('member', 'household', recipe(['rice']), ['rice'], 'session');
  expect(verifyMeal(token, 'member', 'household')).toMatchObject({
    id: 'session',
    recipe: recipe(['rice']),
    trackedIds: ['rice'],
  });
});
test('FR03 / SEC: tokens are bound to a user and household', () => {
  const token = signMeal('member', 'household', recipe(['rice']), ['rice']);
  expect(() => verifyMeal(token, 'other-member', 'household')).toThrow();
  expect(() => verifyMeal(token, 'member', 'other-household')).toThrow();
});
test('FR03 / SEC: tampered and malformed sessions are rejected', () => {
  const token = signMeal('member', 'household', recipe(['rice']), ['rice']);
  for (const invalid of ['', 'payload', `${token}.extra`, `${token.slice(0, -2)}xx`])
    expect(() => verifyMeal(invalid, 'member', 'household')).toThrow();
});
test('FR03: a session expires at its 24-hour boundary', () => {
  const token = signMeal('member', 'household', recipe(['rice']), ['rice']);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(() => verifyMeal(token, 'member', 'household')).toThrow('expired');
});
test('SEC: missing or weak signing configuration fails closed', () => {
  vi.stubEnv('MEAL_SIGNING_SECRET', 'short');
  expect(() => signMeal('member', 'household', recipe(['rice']), ['rice'])).toThrow(
    'not configured',
  );
});
