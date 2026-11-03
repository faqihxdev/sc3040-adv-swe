import 'server-only';
import type { AppState, CookingSession, RankedMeal, Recipe } from '@/domain/model';
import { eligibleItems, expiryPoints, matchesExclusion, todaySingapore } from '@/domain/meals';
import { availableItems } from '@/domain/reservations';
import { signMeal, verifyMeal } from './meal-token';
import { AppError } from './errors';
import savedRecipes from './demo-recipes.json';

export type StoredCookingSession = {
  id: string;
  expires_at: string;
  recipe: Recipe & { source?: 'saved-demo' };
  meal_data: Omit<RankedMeal, 'token'>;
};

export function restoreCookingSession(
  stored: StoredCookingSession,
  userId: string,
  householdId: string,
): CookingSession {
  return {
    id: stored.id,
    expiresAt: stored.expires_at,
    meal: {
      ...stored.meal_data,
      sessionId: stored.id,
      token: signMeal(
        userId,
        householdId,
        stored.recipe,
        stored.meal_data.trackedItems.map((item) => item.id),
        stored.id,
        stored.meal_data.ingredientNames,
        stored.recipe.source,
      ),
    },
  };
}

export function cookingFromTicket(token: string, state: AppState) {
  if (!state.household) throw new AppError('Join a household first.');
  const ticket = verifyMeal(token, state.user.id, state.household.id);
  const today = todaySingapore();
  const inventory = availableItems(state, ticket.id);
  const eligible = eligibleItems(inventory, state.exclusions, [], today);
  const trackedItems = ticket.trackedIds.map((id) => eligible.find((item) => item.id === id));
  if (
    trackedItems.some((item) => !item) ||
    matchesExclusion(ticket.recipe.name, state.exclusions) ||
    Object.values(ticket.ingredientNames ?? {}).some((name) =>
      matchesExclusion(name, state.exclusions),
    )
  )
    throw new AppError(
      'This recipe no longer fits your stock or exclusions. Request fresh suggestions.',
      409,
    );
  const tracked = trackedItems.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const points = tracked.reduce((sum, item) => sum + expiryPoints(item, today), 0);
  const totalPoints = eligible.reduce((sum, item) => sum + expiryPoints(item, today), 0);
  const meal: Omit<RankedMeal, 'token'> = {
    ...ticket.recipe,
    trackedItems: tracked,
    ingredientNames:
      ticket.ingredientNames ?? Object.fromEntries(tracked.map((item) => [item.id, item.name])),
    coverage: tracked.length,
    points,
    totalPoints,
    score: totalPoints ? (points / totalPoints) * 100 : 0,
    ...(ticket.source
      ? {
          source: ticket.source,
          savedImage: savedRecipes.find((recipe) => recipe.name === ticket.recipe.name)?.image,
        }
      : {}),
  };
  return {
    ticket,
    meal,
    recipe: { ...ticket.recipe, ...(ticket.source ? { source: ticket.source } : {}) },
  };
}
