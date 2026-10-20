import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AppState, MealRequest, RankedMeal } from '@/domain/model';
import {
  eligibleItems,
  matchesExclusion,
  normalize,
  todaySingapore,
  validateAndRank,
} from '@/domain/meals';
import { quantityAvailable, unitSchema } from '@/domain/quantities';
import { AppError } from './errors';
import { signMeal } from './meal-token';
import savedRecipes from './demo-recipes.json';
import { availableItems } from '@/domain/reservations';

export function demoMealsEnabled(state: Pick<AppState, 'household'>) {
  return (
    process.env.DEMO_MODE === 'true' &&
    Boolean(state.household) &&
    state.household!.id === process.env.DEMO_HOUSEHOLD_ID
  );
}

/** A saved Lab 4 set, rebound to current stock and signed like live suggestions. */
export function savedDemoMeals(state: AppState, request: MealRequest) {
  if (!demoMealsEnabled(state)) throw new AppError('Saved demo recipes are unavailable.', 403);
  state = { ...state, items: availableItems(state) };
  if (
    request.servings !== 2 ||
    request.mealType !== 'Dinner' ||
    !['', 'use bean sprouts if possible'].includes(normalize(request.preferences))
  )
    throw new AppError(
      'Saved demo recipes are for Dinner for 2, with bean sprouts preferred. Change preferences to use them.',
      409,
    );
  const today = todaySingapore();
  const items = eligibleItems(state.items, state.exclusions, request.excludedIds, today);
  const staples = [...new Set(request.staples)]
    .map((name, i) => ({ id: `staple-${i}`, name }))
    .filter((item) => !matchesExclusion(item.name, state.exclusions));
  const candidates = savedRecipes.map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ingredientId:
        ingredient.source === 'staple'
          ? (staples.find((item) => normalize(item.name) === normalize(ingredient.name))?.id ??
            'unavailable')
          : (items
              .filter(
                (item) =>
                  normalize(item.name) === normalize(ingredient.name) &&
                  quantityAvailable(
                    item.quantity,
                    item.unit,
                    ingredient.amount,
                    unitSchema.parse(ingredient.unit),
                  ),
              )
              .sort(
                (a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id.localeCompare(b.id),
              )[0]?.id ?? 'unavailable'),
      amount: ingredient.amount,
      unit: ingredient.unit,
    })),
  }));
  const ranked = validateAndRank(
    candidates,
    state.items,
    staples,
    request,
    state.exclusions,
    today,
  );
  if (!ranked.length)
    throw new AppError(
      'No saved demo recipes fit your current stock, staples and exclusions. Check the demo setup or try live generation.',
      409,
    );
  const sessionId = randomUUID();
  const meals: RankedMeal[] = ranked.map((meal) => ({
    ...meal,
    source: 'saved-demo',
    savedImage: savedRecipes.find((recipe) => recipe.name === meal.name)!.image,
    token: signMeal(
      state.user.id,
      state.household!.id,
      meal,
      meal.trackedItems.map((item) => item.id),
      sessionId,
      meal.ingredientNames,
      'saved-demo',
    ),
  }));
  return {
    meals,
    message:
      ranked.length < savedRecipes.length
        ? `${ranked.length} saved recipe${ranked.length === 1 ? '' : 's'} fit your current stock and exclusions.`
        : '',
  };
}
