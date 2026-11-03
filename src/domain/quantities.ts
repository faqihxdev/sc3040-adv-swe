import { z } from 'zod';

export const units = ['g', 'ml', 'piece'] as const;
export const unitSchema = z.enum(units);
export type Unit = (typeof units)[number];
export const unitLabels: Record<Unit, string> = { g: 'g', ml: 'mL', piece: 'pieces' };
export const quantitySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
    'Use at most two decimal places.',
  );
export const positiveQuantitySchema = quantitySchema.gt(0);
export const discardReasons = ['spoiled', 'past_date', 'prep', 'other'] as const;
export const discardReasonSchema = z.enum(discardReasons);
export type DiscardReason = (typeof discardReasons)[number];
export const discardReasonLabels: Record<DiscardReason, string> = {
  spoiled: 'Spoiled',
  past_date: 'Past date',
  prep: 'Preparation scraps',
  other: 'Other',
};

export function sameUnit(left: Unit | null | undefined, right: Unit | null | undefined) {
  return left !== null && left !== undefined && left === right;
}

export function quantityAvailable(
  quantity: number | null,
  unit: Unit | null,
  amount: number,
  expectedUnit: Unit,
) {
  return (
    quantity !== null &&
    quantitySchema.safeParse(quantity).success &&
    positiveQuantitySchema.safeParse(amount).success &&
    sameUnit(unit, expectedUnit) &&
    amount <= quantity
  );
}
export function formatQuantity(amount: number | null, unit: Unit | null) {
  return amount === null || unit === null
    ? 'Set amount'
    : `${amount.toLocaleString('en-SG', { maximumFractionDigits: 2 })} ${amount === 1 && unit === 'piece' ? 'piece' : unitLabels[unit]}`;
}
export function remainingQuantity(before: number, usedAmount: number, discardedAmount: number) {
  return Math.round((before - usedAmount - discardedAmount) * 100) / 100;
}
