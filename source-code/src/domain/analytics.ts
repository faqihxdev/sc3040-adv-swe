import type { Outcome } from './model';
import { todaySingapore, normalize } from './meals';
export function weeklyCounts(
  days: { date: string; meals: number; used: number; discarded: number }[],
) {
  const weeks = new Map<string, { date: string; meals: number; used: number; discarded: number }>();
  for (const day of days) {
    const date = new Date(day.date);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = date.toISOString().slice(0, 10);
    const row = weeks.get(key) ?? { date: key, meals: 0, used: 0, discarded: 0 };
    row.meals += day.meals;
    row.used += day.used;
    row.discarded += day.discarded;
    weeks.set(key, row);
  }
  return [...weeks.values()];
}

export function summarize(outcomes: Outcome[], start: string, end: string) {
  const selected = outcomes.filter((o) => {
    const d = todaySingapore(new Date(o.created_at));
    return d >= start && d <= end;
  });
  const days = new Map<string, { date: string; meals: number; used: number; discarded: number }>();
  const ingredients = new Map<string, { name: string; count: number }>();
  const categories = new Map<string, number>();
  let used = 0,
    discarded = 0;
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.set(date, { date, meals: 0, used: 0, discarded: 0 });
  }
  for (const o of selected) {
    const d = todaySingapore(new Date(o.created_at));
    const day = days.get(d)!;
    day.meals++;
    for (const i of o.ingredients) {
      if (i.used) {
        used++;
        day.used++;
      }
      if (i.discarded) {
        discarded++;
        day.discarded++;
        const key = i.name.trim().toLowerCase();
        const entry = ingredients.get(key) ?? { name: i.name, count: 0 };
        entry.count++;
        ingredients.set(key, entry);
        const cat = i.category.trim() || 'Uncategorised';
        categories.set(cat, (categories.get(cat) ?? 0) + 1);
      }
    }
  }
  return {
    meals: selected.length,
    used,
    discarded,
    synthetic: selected.some((o) => o.synthetic),
    daily: [...days.values()],
    ingredients: [...ingredients.values()].sort(
      (a, b) => b.count - a.count || normalize(a.name).localeCompare(normalize(b.name)),
    ),
    categories: [...categories]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    records: selected,
  };
}
