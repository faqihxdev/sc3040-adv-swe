import type { Item, MealRequest, Recipe } from '@/domain/model';
export const today = '2026-10-01';
export function ingredient(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    household_id: 'household',
    name: `Food ${id}`,
    stock: 3,
    expiry_date: today,
    category: 'Vegetables',
    location: 'Fridge',
    version: 1,
    deleted: false,
    updated_by: 'member',
    updated_at: '2026-10-01T00:00:00Z',
    ...patch,
  };
}
export const request: MealRequest = {
  servings: 2,
  mealType: 'Dinner',
  preferences: '',
  staples: [],
  excludedIds: [],
};
export function recipe(ids: string[], patch: Partial<Recipe> = {}): Recipe {
  return {
    name: 'Test meal',
    summary: 'A meal from confirmed ingredients.',
    servings: 2,
    cookingMinutes: 20,
    ingredients: ids.map((ingredientId) => ({ ingredientId, estimatedAmount: 'Some' })),
    steps: ['Prepare the ingredients.', 'Combine the ingredients.', 'Cook thoroughly.', 'Serve.'],
    ...patch,
  };
}
