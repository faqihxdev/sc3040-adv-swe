import 'server-only';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { recipeSchema, type Recipe } from '@/domain/model';
import { AppError } from './state';
type Ticket = {
  format: 2;
  id: string;
  userId: string;
  householdId: string;
  expires: number;
  recipe: Recipe;
  trackedIds: string[];
  ingredientNames?: Record<string, string>;
};
export function signMeal(
  userId: string,
  householdId: string,
  recipe: Recipe,
  trackedIds: string[],
  sessionId: string = randomUUID(),
  ingredientNames?: Record<string, string>,
) {
  const payload = Buffer.from(
    JSON.stringify({
      format: 2,
      id: sessionId,
      userId,
      householdId,
      expires: Date.now() + 24 * 60 * 60 * 1000,
      recipe: recipeSchema.parse(recipe),
      trackedIds,
      ingredientNames,
    } satisfies Ticket),
  ).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
function signature(payload: string) {
  const key = process.env.MEAL_SIGNING_SECRET;
  if (!key || key.length < 32) throw new AppError('Meal signing is not configured.', 503);
  return createHmac('sha256', key).update(payload).digest('base64url');
}
export function verifyMeal(token: string, userId: string, householdId: string) {
  const [payload, sig, ...extra] = token.split('.');
  if (!payload || !sig || extra.length) throw new AppError('Invalid cooking session.');
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new AppError('Invalid cooking session.');
  const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Ticket;
  if (
    ticket.format !== 2 ||
    ticket.userId !== userId ||
    ticket.householdId !== householdId ||
    ticket.expires <= Date.now()
  )
    throw new AppError('This cooking session expired. Request fresh suggestions.');
  return ticket;
}
