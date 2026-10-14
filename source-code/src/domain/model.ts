import { z } from 'zod';
import {
  discardReasonSchema,
  positiveQuantitySchema,
  quantitySchema,
  unitSchema,
  type DiscardReason,
  type Unit,
} from './quantities';
export type { Unit } from './quantities';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Enter a valid date.',
  );
const itemFields = {
  name: z.string().trim().min(1).max(100),
  quantity: quantitySchema,
  unit: unitSchema,
  expiry_date: dateSchema,
  category: z.string().trim().max(50),
  location: z.string().trim().max(50),
};
export const itemInput = z.object(itemFields);
export type ItemInput = z.infer<typeof itemInput>;
export type Item = {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  expiry_date: string;
  category: string;
  location: string;
  id: string;
  household_id: string;
  version: number;
  deleted: boolean;
  updated_at: string;
  updated_by: string | null;
};
export type Household = {
  id: string;
  name: string;
  owner_id: string;
  version: number;
  locations: string[];
};
export type Member = { id: string; display_name: string };
export type Activity = {
  id: number;
  actor_id: string | null;
  action: string;
  label: string;
  created_at: string;
};
export type OutcomeIngredient = {
  id: string;
  name: string;
  category: string;
  used: boolean;
  discarded: boolean;
  stock?: number;
  before_stock?: number;
  unit?: Unit | null;
  before_quantity?: number | null;
  quantity?: number | null;
  used_amount?: number;
  expiry_date?: string | null;
  discarded_amount?: number;
  discard_reason?: DiscardReason | null;
};
export type Outcome = {
  id: string;
  created_at: string;
  recipe: { name: string };
  ingredients: OutcomeIngredient[];
  synthetic: boolean;
};
export type AppState = {
  user: { id: string; email: string; display_name: string };
  household: Household | null;
  members: Member[];
  items: Item[];
  activity: Activity[];
  outcomes: Outcome[];
  exclusions: string[];
  aiEnabled: boolean;
  demoResetEnabled?: boolean;
  demoMealsEnabled?: boolean;
  quantityEvents?: QuantityEvent[];
};
export type QuantityEvent = {
  id: string;
  sequence?: number;
  voided?: boolean;
  item_id: string;
  name: string;
  category: string;
  unit: Unit;
  kind: 'opening' | 'restock' | 'used' | 'discarded' | 'adjustment' | 'undo';
  amount: number;
  before_quantity: number | null;
  quantity: number;
  created_at: string;
  synthetic: boolean;
  discard_reason?: DiscardReason | null;
};
export const requestSchema = z.object({
  servings: z.number().int().min(1).max(4),
  mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']),
  preferences: z.string().trim().max(500),
  staples: z.array(z.string().trim().min(1).max(60)).max(20),
  excludedIds: z.array(z.uuid()).max(100),
});
export type MealRequest = z.infer<typeof requestSchema>;
export const recipeSchema = z.object({
  name: z.string().min(1).max(100),
  summary: z.string().max(300),
  servings: z.number().int().min(1).max(4),
  cookingMinutes: z.number().int().min(1).max(1440),
  ingredients: z
    .array(z.object({ ingredientId: z.string(), amount: positiveQuantitySchema, unit: unitSchema }))
    .min(1)
    .max(50),
  steps: z.array(z.string().min(1).max(800)).min(4).max(6),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type RankedMeal = Recipe & {
  score: number;
  points: number;
  totalPoints: number;
  coverage: number;
  trackedItems: Item[];
  ingredientNames: Record<string, string>;
  token: string;
  source?: 'saved-demo';
  savedImage?: string;
};
export const confirmationSchema = z.object({
  token: z.string().max(100000),
  changes: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.number().int().positive(),
        usedAmount: quantitySchema,
        discardedAmount: quantitySchema,
        discardReason: discardReasonSchema.nullable(),
      }),
    )
    .min(1)
    .max(100),
});
export type Change = z.infer<typeof confirmationSchema>['changes'][number];
const version = z.number().int().positive();
export const commandSchema = z.union([
  z.object({ command: z.literal('create_household'), name: z.string().trim().min(1).max(80) }),
  z.object({
    command: z.literal('join_household'),
    code: z
      .string()
      .trim()
      .regex(/^[A-Fa-f0-9]{12}$/, 'Use the 12-character join code.'),
  }),
  z.object({
    command: z.literal('preferences'),
    exclusions: z.array(z.string().trim().min(1).max(80)).max(30),
  }),
  itemInput
    .and(z.object({ command: z.literal('add_item') }))
    .refine((v) => v.quantity > 0, 'Quantity must be positive.'),
  z.object({
    command: z.literal('add_items'),
    householdId: z.uuid(),
    requestId: z.uuid(),
    items: z
      .array(itemInput.refine((v) => v.quantity > 0, 'Quantity must be positive.'))
      .min(1)
      .max(10),
  }),
  itemInput.and(z.object({ command: z.literal('edit_item'), id: z.uuid(), version })),
  z.object({
    command: z.literal('adjust_item'),
    id: z.uuid(),
    version,
    kind: z.enum(['restock', 'discarded']),
    amount: positiveQuantitySchema,
    discardReason: discardReasonSchema.nullable(),
  }),
  z.object({ command: z.literal('remove_item'), id: z.uuid(), version }),
  z.object({ command: z.literal('undo') }),
  z.object({ command: z.literal('invite') }),
  z.object({ command: z.literal('leave'), version }),
  z.object({ command: z.literal('remove_member'), user_id: z.uuid(), version }),
  z.object({ command: z.literal('transfer'), user_id: z.uuid(), version }),
  z.object({ command: z.literal('delete_household'), version, confirmation: z.string() }),
  z.object({ command: z.literal('delete_account'), confirmation: z.literal('DELETE') }),
]);
