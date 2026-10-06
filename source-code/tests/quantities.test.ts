import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  positiveQuantitySchema,
  quantityAvailable,
  quantitySchema,
  remainingQuantity,
  sameUnit,
} from '@/domain/quantities';

describe('exact quantities', () => {
  it('accepts finite quantities with two decimal places', () => {
    expect(quantitySchema.safeParse(0.29).success).toBe(true);
    expect(quantitySchema.safeParse(Number.NaN).success).toBe(false);
    expect(quantitySchema.safeParse(1.234).success).toBe(false);
  });
  it('rounds remaining values to quantity precision', () => {
    expect(remainingQuantity(1, 0.29, 0.3)).toBe(0.41);
  });
  it('keeps unit families separate and requires a measured balance', () => {
    expect(sameUnit('g', 'g')).toBe(true);
    expect(sameUnit('g', 'ml')).toBe(false);
    expect(sameUnit(null, null)).toBe(false);
    expect(sameUnit(undefined, undefined)).toBe(false);
    expect(quantityAvailable(500, 'g', 500, 'g')).toBe(true);
    expect(quantityAvailable(500, 'g', 501, 'g')).toBe(false);
    expect(quantityAvailable(500, 'g', 5, 'piece')).toBe(false);
    expect(quantityAvailable(null, null, 5, 'g')).toBe(false);
    expect(quantityAvailable(500, 'g', -1, 'g')).toBe(false);
    expect(quantityAvailable(500, 'g', 0, 'g')).toBe(false);
    expect(quantityAvailable(500, 'g', NaN, 'g')).toBe(false);
    expect(quantityAvailable(NaN, 'g', 1, 'g')).toBe(false);
  });
  it('uses explicit units and a useful unknown-amount label', () => {
    expect(formatQuantity(null, null)).toBe('Set amount');
    expect(formatQuantity(100, null)).toBe('Set amount');
    expect(formatQuantity(3200, 'g')).toBe('3,200 g');
    expect(formatQuantity(0.29, 'ml')).toBe('0.29 mL');
    expect(formatQuantity(1, 'piece')).toBe('1 piece');
    expect(formatQuantity(2, 'piece')).toBe('2 pieces');
  });
  it('allows zero for a depleted record and requires positive replenishment', () => {
    for (const value of [-1, Infinity, NaN, 1_000_001, 0.001])
      expect(quantitySchema.safeParse(value).success).toBe(false);
    expect(quantitySchema.safeParse(0).success).toBe(true);
    expect(quantitySchema.safeParse(1_000_000).success).toBe(true);
    expect(positiveQuantitySchema.safeParse(0).success).toBe(false);
    expect(positiveQuantitySchema.safeParse(0.01).success).toBe(true);
  });
});
