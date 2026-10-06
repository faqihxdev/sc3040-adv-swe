import { describe, expect, it } from 'vitest';
import { summarize } from '@/domain/analytics';
import { makeDemoSeed } from '@/domain/demo-data';
import type { Outcome, OutcomeIngredient } from '@/domain/model';
import { randomUUID } from 'node:crypto';

const ingredient = (patch: Partial<OutcomeIngredient> = {}): OutcomeIngredient => ({
  id: 'rice',
  name: 'Rice',
  category: 'Grains',
  used: true,
  discarded: false,
  unit: 'g',
  used_amount: 100,
  expiry_date: '2026-10-06',
  ...patch,
});
const meal = (ingredients: OutcomeIngredient[], patch: Partial<Outcome> = {}): Outcome => ({
  id: 'meal-1',
  created_at: '2026-10-06T04:00:00Z',
  recipe: { name: 'Rice bowl' },
  synthetic: false,
  ingredients,
  ...patch,
});
const metric = (outcomes: Outcome[], start = '2026-10-01', end = '2026-10-07') =>
  summarize(outcomes, start, end).dashboard.nearExpiry;

describe('used near expiry', () => {
  it('counts inclusive expiry-day through three-day uses, independently of amount and unit', () => {
    const result = metric([
      meal([
        ingredient(),
        ingredient({
          id: 'milk',
          name: 'Milk',
          unit: 'ml',
          used_amount: 250,
          expiry_date: '2026-10-09',
        }),
        ingredient({
          id: 'egg',
          name: 'Eggs',
          unit: 'piece',
          used_amount: 1,
          expiry_date: '2026-10-07',
        }),
        ingredient({ id: 'later', expiry_date: '2026-10-10' }),
        ingredient({ id: 'zero', used_amount: 0 }),
      ]),
    ]);
    expect(result.count).toBe(3);
    expect(result.trackedUses).toBe(4);
    expect(result.untrackedUses).toBe(0);
    expect(result.records.map((row) => [row.name, row.amount, row.unit])).toEqual([
      ['Eggs', 1, 'piece'],
      ['Milk', 250, 'ml'],
      ['Rice', 100, 'g'],
    ]);
    expect(result.trend.find((row) => row.date === '2026-10-06')?.count).toBe(3);
  });
  it('keeps unknown history separate and excludes discard-only entries', () => {
    const result = metric([
      meal([
        ingredient({ id: 'legacy', expiry_date: undefined, used_amount: undefined }),
        ingredient({ id: 'missing', expiry_date: null }),
        ingredient({ id: 'invalid', expiry_date: '2026-02-30' }),
        ingredient({ id: 'expired', expiry_date: '2026-10-05' }),
        ingredient({ id: 'unitless', unit: null }),
        ingredient({
          id: 'waste',
          used: false,
          used_amount: 0,
          discarded: true,
          discarded_amount: 20,
        }),
      ]),
    ]);
    expect(result).toMatchObject({ count: 0, trackedUses: 0, untrackedUses: 5, records: [] });
    expect(result.trend.every((row) => row.count === 0)).toBe(true);
  });
  it('uses Singapore cooking dates and clips reporting periods', () => {
    const result = metric(
      [
        meal([ingredient({ expiry_date: '2026-10-09' })], { created_at: '2026-10-05T16:00:00Z' }),
        meal([ingredient()], { id: 'outside', created_at: '2026-10-05T15:59:59Z' }),
        meal([ingredient({ expiry_date: '2026-10-10' })], {
          id: 'tomorrow',
          created_at: '2026-10-06T16:00:00Z',
        }),
      ],
      '2026-10-06',
      '2026-10-06',
    );
    expect(result.count).toBe(1);
    expect(result.records[0]).toMatchObject({ date: '2026-10-06', daysLeft: 3 });
  });
  it('counts the same ingredient again in a later meal, with its own saved date', () => {
    const result = metric([
      meal([ingredient()]),
      meal([ingredient({ used_amount: 40, expiry_date: '2026-10-10' })], {
        id: 'meal-2',
        created_at: '2026-10-07T04:00:00Z',
      }),
    ]);
    expect(result.count).toBe(2);
    expect(new Set(result.records.map((row) => row.id)).size).toBe(2);
    expect(result.records[0].amount).toBe(40);
  });
  it('uses only saved snapshots, never current inventory dates', () => {
    const result = metric([meal([ingredient({ expiry_date: '2026-10-10' })])]);
    expect(result).toMatchObject({ count: 0, trackedUses: 1, untrackedUses: 0 });
  });
  it.each(['2026-10-04', '2026-10-06', '2027-01-02', '2028-03-01'])(
    'gives the rolling seed measured near-expiry uses on %s',
    (today) => {
      const seed = makeDemoSeed(today, randomUUID);
      const start = new Date(Date.parse(today) - 27 * 86400000).toISOString().slice(0, 10);
      const result = metric(seed.outcomes, start, today);
      expect(result.count).toBeGreaterThan(10);
      expect(result.trackedUses).toBeGreaterThan(result.count);
      expect(result.untrackedUses).toBe(0);
      expect(result.trend.reduce((sum, row) => sum + row.count, 0)).toBe(result.count);
      expect(new Set(result.records.map((row) => row.unit))).toEqual(new Set(['g', 'ml', 'piece']));
    },
  );
});
