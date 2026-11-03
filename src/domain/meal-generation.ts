import type { RankedMeal } from './model';

export const mealGenerationStages = [
  'preparing',
  'generating',
  'validating',
  'repairing',
  'ranking',
] as const;
export type MealGenerationStage = (typeof mealGenerationStages)[number];
export type MealGenerationResult = { meals: RankedMeal[]; message: string };
export type MealGenerationEvent =
  | { type: 'stage'; stage: MealGenerationStage }
  | { type: 'result'; result: MealGenerationResult }
  | { type: 'error'; error: string; status: number };
