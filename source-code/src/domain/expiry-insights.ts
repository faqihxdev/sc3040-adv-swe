import { dateSchema, type Outcome } from './model';
import { daysUntil, todaySingapore } from './meals';
import { positiveQuantitySchema, unitSchema, type Unit } from './quantities';

export type NearExpiryRecord = {
  id: string;
  name: string;
  recipe: string;
  date: string;
  expiryDate: string;
  daysLeft: number;
  amount: number;
  unit: Unit;
};

export function summarizeNearExpiry(
  outcomes: Outcome[],
  start: string,
  end: string,
  buckets: { date: string; end: string }[],
) {
  const records: NearExpiryRecord[] = [];
  let trackedUses = 0;
  let untrackedUses = 0;
  for (const outcome of outcomes) {
    const date = todaySingapore(new Date(outcome.created_at));
    if (date < start || date > end) continue;
    for (const item of outcome.ingredients) {
      if (item.used_amount === 0 || (!item.used && !(Number(item.used_amount) > 0))) continue;
      const expiry = dateSchema.safeParse(item.expiry_date);
      const amount = positiveQuantitySchema.safeParse(item.used_amount);
      const unit = unitSchema.safeParse(item.unit);
      if (!expiry.success || !amount.success || !unit.success || expiry.data < date) {
        untrackedUses += 1;
        continue;
      }
      trackedUses += 1;
      const daysLeft = daysUntil(expiry.data, date);
      if (daysLeft > 3) continue;
      records.push({
        id: `${outcome.id}:${item.id}`,
        name: item.name,
        recipe: outcome.recipe.name,
        date,
        expiryDate: expiry.data,
        daysLeft,
        amount: amount.data,
        unit: unit.data,
      });
    }
  }
  records.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  return {
    count: records.length,
    trackedUses,
    untrackedUses,
    records,
    trend: buckets.map(({ date, end }) => ({
      date,
      end,
      count: records.filter((row) => row.date >= date && row.date <= end).length,
    })),
  };
}
