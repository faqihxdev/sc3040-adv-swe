import type { Item, Outcome, QuantityEvent } from './model';
import type { Unit } from './quantities';
import { todaySingapore, normalize } from './meals';
import { summarizeNearExpiry } from './expiry-insights';

export type DailyCount = { date: string; meals: number; used: number; discarded: number };
export type QuantityTrend = { date: string; unit: Unit; used: number; discarded: number };
export type QuantityRow = {
  name: string;
  category?: string;
  unit: Unit;
  amount: number;
  share: number;
};
export type WasteIngredientRow = {
  key: string;
  name: string;
  unit: Unit;
  used: number;
  discarded: number;
  wasteRate: number;
  discardEvents: number;
  avoidableDiscardEvents: number;
  itemId: string | null;
};

function inPeriod(iso: string, start: string, end: string) {
  const date = todaySingapore(new Date(iso));
  return date >= start && date <= end;
}
function daysBetween(start: string, end: string) {
  return Math.max(1, Math.floor((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
}
function amountFor(event: QuantityEvent) {
  return Math.abs(event.amount);
}

export function weeklyCounts(days: DailyCount[]) {
  const weeks = new Map<string, DailyCount>();
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

export function summarize(
  outcomes: Outcome[],
  start: string,
  end: string,
  quantityEvents: QuantityEvent[] = [],
  items: Item[] = [],
) {
  const selected = outcomes.filter((o) => inPeriod(o.created_at, start, end));
  const days = new Map<string, DailyCount>();
  const legacyIngredients = new Map<string, { name: string; count: number }>();
  const legacyCategories = new Map<string, number>();
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.set(date, { date, meals: 0, used: 0, discarded: 0 });
  }
  let used = 0,
    discarded = 0;
  for (const outcome of selected) {
    const date = todaySingapore(new Date(outcome.created_at));
    days.get(date)!.meals += 1;
    for (const ingredient of outcome.ingredients) {
      if (ingredient.used) {
        used += 1;
        days.get(date)!.used += 1;
      }
      if (ingredient.discarded) {
        discarded += 1;
        days.get(date)!.discarded += 1;
        const key = ingredient.name.trim().toLowerCase();
        const row = legacyIngredients.get(key) ?? { name: ingredient.name, count: 0 };
        row.count += 1;
        legacyIngredients.set(key, row);
        const category = ingredient.category.trim() || 'Uncategorised';
        legacyCategories.set(category, (legacyCategories.get(category) ?? 0) + 1);
      }
    }
  }

  const events = quantityEvents.filter(
    (event) => !event.voided && inPeriod(event.created_at, start, end),
  );
  const trends = new Map<string, QuantityTrend>();
  const wasteByName = new Map<string, QuantityRow>();
  const wasteByCategory = new Map<string, QuantityRow>();
  const reasons = new Map<string, { name: string; unit: Unit; amount: number }>();
  const knownUnits = new Set<Unit>();
  for (const event of events) {
    knownUnits.add(event.unit);
    const date = todaySingapore(new Date(event.created_at));
    const key = `${date}:${event.unit}`;
    const row = trends.get(key) ?? { date, unit: event.unit, used: 0, discarded: 0 };
    const amount = amountFor(event);
    if (event.kind === 'used') {
      row.used += amount;
    }
    if (event.kind === 'discarded') {
      row.discarded += amount;
      const nameKey = `${event.name.trim().toLowerCase()}:${event.unit}`;
      const nameRow = wasteByName.get(nameKey) ?? {
        name: event.name,
        category: event.category,
        unit: event.unit,
        amount: 0,
        share: 0,
      };
      nameRow.amount += amount;
      wasteByName.set(nameKey, nameRow);
      const category = event.category.trim() || 'Uncategorised';
      const categoryKey = `${category}:${event.unit}`;
      const categoryRow = wasteByCategory.get(categoryKey) ?? {
        name: category,
        category,
        unit: event.unit,
        amount: 0,
        share: 0,
      };
      categoryRow.amount += amount;
      wasteByCategory.set(categoryKey, categoryRow);
      const reason = event.discard_reason ?? 'unspecified';
      const reasonKey = `${reason}:${event.unit}`;
      const reasonRow = reasons.get(reasonKey) ?? { name: reason, unit: event.unit, amount: 0 };
      reasonRow.amount += amount;
      reasons.set(reasonKey, reasonRow);
    }
    trends.set(key, row);
  }
  const shareRows = (rows: QuantityRow[]) =>
    rows.map((row) => ({
      ...row,
      share:
        row.amount /
        Math.max(
          Number.EPSILON,
          rows
            .filter((candidate) => candidate.unit === row.unit)
            .reduce((sum, candidate) => sum + candidate.amount, 0),
        ),
    }));
  const unitTotals = new Map<Unit, { used: number; discarded: number; restocked: number }>();
  for (const event of events) {
    const totals = unitTotals.get(event.unit) ?? { used: 0, discarded: 0, restocked: 0 };
    if (event.kind === 'used') totals.used += amountFor(event);
    if (event.kind === 'discarded') totals.discarded += amountFor(event);
    if (event.kind === 'restock') totals.restocked += amountFor(event);
    unitTotals.set(event.unit, totals);
  }

  const inventory = items
    .filter((item) => !item.deleted)
    .map((item) => {
      const quantity = item.quantity ?? null;
      const unit = item.unit ?? null;
      const daysToExpiry = Math.ceil((Date.parse(item.expiry_date) - Date.parse(end)) / 86400000);
      return {
        ...item,
        quantity,
        unit,
        daysToExpiry,
        dailyRate: null as number | null,
        daysOfCover: null as number | null,
        observedDays: 0,
        usageDays: 0,
        lastUsedDate: null as string | null,
      };
    });
  const pace = new Map<
    string,
    { name: string; unit: Unit; used: number; first: number; last: number }
  >();
  for (const event of quantityEvents.filter(
    (e) => !e.voided && e.kind === 'used' && inPeriod(e.created_at, start, end),
  )) {
    const row = pace.get(event.item_id) ?? {
      name: event.name,
      unit: event.unit,
      used: 0,
      first: Date.parse(event.created_at),
      last: Date.parse(event.created_at),
    };
    row.used += amountFor(event);
    row.first = Math.min(row.first, Date.parse(event.created_at));
    row.last = Math.max(row.last, Date.parse(event.created_at));
    pace.set(event.item_id, row);
  }
  for (const item of inventory) {
    const row = pace.get(item.id);
    const observedDays = quantityEvents
      .filter(
        (event) =>
          event.item_id === item.id &&
          !event.voided &&
          event.kind === 'used' &&
          event.unit === row?.unit &&
          inPeriod(event.created_at, start, end),
      )
      .map((event) => todaySingapore(new Date(event.created_at)));
    const firstDate = quantityEvents
      .filter(
        (event) =>
          !event.voided &&
          event.item_id === item.id &&
          event.unit === item.unit &&
          todaySingapore(new Date(event.created_at)) <= end,
      )
      .map((event) => todaySingapore(new Date(event.created_at)))
      .sort()[0];
    const observationStart = firstDate && firstDate > start ? firstDate : start;
    item.observedDays = firstDate ? daysBetween(observationStart, end) : 0;
    item.usageDays = new Set(observedDays).size;
    const allUseDates = quantityEvents
      .filter(
        (event) =>
          !event.voided &&
          event.item_id === item.id &&
          event.unit === item.unit &&
          event.kind === 'used' &&
          todaySingapore(new Date(event.created_at)) <= end,
      )
      .map((event) => todaySingapore(new Date(event.created_at)))
      .sort();
    item.lastUsedDate = allUseDates.at(-1) ?? null;
    if (
      row &&
      row.unit === item.unit &&
      item.quantity !== null &&
      item.observedDays >= 14 &&
      item.usageDays >= 3 &&
      row.used > 0
    ) {
      item.dailyRate = row.used / item.observedDays;
      item.daysOfCover =
        item.quantity !== null && item.dailyRate > 0 ? item.quantity / item.dailyRate : null;
    }
  }
  const currentByNameUnit = new Map<string, Item[]>();
  for (const item of inventory) {
    if (item.unit) {
      const key = `${normalize(item.name)}:${item.unit}`;
      currentByNameUnit.set(key, [...(currentByNameUnit.get(key) ?? []), item]);
    }
  }
  const dashboardRows = new Map<string, WasteIngredientRow>();
  const dashboardReasons = new Map<string, number>();
  const avoidableByIngredient = new Map<string, { name: string; unit: Unit; count: number }>();
  let wasteIncidents = 0;
  for (const event of events) {
    if (event.kind !== 'used' && event.kind !== 'discarded') continue;
    if (amountFor(event) === 0) continue;
    const key = `${normalize(event.name)}:${event.unit}`;
    const matchingItems = currentByNameUnit.get(key) ?? [];
    const row = dashboardRows.get(key) ?? {
      key,
      name: event.name.trim(),
      unit: event.unit,
      used: 0,
      discarded: 0,
      wasteRate: 0,
      discardEvents: 0,
      avoidableDiscardEvents: 0,
      itemId: matchingItems.length === 1 ? matchingItems[0].id : null,
    };
    if (event.kind === 'used') row.used += amountFor(event);
    else {
      row.discarded += amountFor(event);
      row.discardEvents += 1;
      wasteIncidents += 1;
      const reason = event.discard_reason ?? 'unspecified';
      dashboardReasons.set(reason, (dashboardReasons.get(reason) ?? 0) + 1);
      if (reason === 'spoiled' || reason === 'past_date') {
        row.avoidableDiscardEvents += 1;
        const avoidableKey = `${normalize(event.name)}:${event.unit}`;
        const avoidable = avoidableByIngredient.get(avoidableKey) ?? {
          name: event.name.trim(),
          unit: event.unit,
          count: 0,
        };
        avoidable.count += 1;
        avoidableByIngredient.set(avoidableKey, avoidable);
      }
    }
    row.wasteRate = row.discarded / Math.max(Number.EPSILON, row.used + row.discarded);
    dashboardRows.set(key, row);
  }
  const wasteByIngredient = [...dashboardRows.values()]
    .filter((row) => row.discarded > 0)
    .sort(
      (a, b) =>
        b.wasteRate - a.wasteRate ||
        b.discardEvents - a.discardEvents ||
        normalize(a.name).localeCompare(normalize(b.name)),
    );
  const trendMap = new Map<
    string,
    { date: string; end: string; avoidable: number; prep: number; other: number; total: number }
  >();
  const periodDays = daysBetween(start, end);
  const addDays = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const bucketStart = (date: string) => {
    if (periodDays <= 7) return date;
    const parsed = new Date(`${date}T00:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
    return parsed.toISOString().slice(0, 10);
  };
  const firstBucket = periodDays <= 7 ? start : bucketStart(start);
  for (let cursor = firstBucket; cursor <= end; cursor = addDays(cursor, periodDays <= 7 ? 1 : 7)) {
    const clippedStart = cursor < start ? start : cursor;
    const clippedEnd =
      periodDays <= 7 ? clippedStart : addDays(cursor, 6) > end ? end : addDays(cursor, 6);
    trendMap.set(cursor, {
      date: clippedStart,
      end: clippedEnd,
      avoidable: 0,
      prep: 0,
      other: 0,
      total: 0,
    });
  }
  for (const event of events) {
    if (event.kind !== 'discarded' || amountFor(event) === 0) continue;
    const bucket = trendMap.get(bucketStart(todaySingapore(new Date(event.created_at))));
    if (!bucket) continue;
    bucket.total += 1;
    if (event.discard_reason === 'spoiled' || event.discard_reason === 'past_date')
      bucket.avoidable += 1;
    else if (event.discard_reason === 'prep') bucket.prep += 1;
    else bucket.other += 1;
  }
  const wasteTrend = [...trendMap.values()];
  const avoidableIngredients = [...avoidableByIngredient.values()].sort(
    (a, b) =>
      b.count - a.count ||
      normalize(a.name).localeCompare(normalize(b.name)) ||
      a.unit.localeCompare(b.unit),
  );
  const insight = avoidableIngredients[0]
    ? `${avoidableIngredients[0].name} (${avoidableIngredients[0].unit}) was the top avoidable discard, with ${avoidableIngredients[0].count} recorded incident${avoidableIngredients[0].count === 1 ? '' : 's'}.`
    : null;
  const dashboard = {
    nearExpiry: summarizeNearExpiry(selected, start, end, wasteTrend),
    inStock: inventory.filter((item) => item.quantity !== null && item.quantity > 0).length,
    expiringSoon: inventory.filter(
      (item) =>
        item.quantity !== null &&
        item.quantity > 0 &&
        item.daysToExpiry >= 0 &&
        item.daysToExpiry <= 7,
    ).length,
    pastDate: inventory.filter(
      (item) => item.quantity !== null && item.quantity > 0 && item.daysToExpiry < 0,
    ).length,
    unmeasured: inventory.filter((item) => item.quantity === null).length,
    wasteByIngredient,
    repeatedWaste: wasteByIngredient
      .filter((row) => row.avoidableDiscardEvents >= 2)
      .sort(
        (a, b) =>
          b.avoidableDiscardEvents - a.avoidableDiscardEvents ||
          b.wasteRate - a.wasteRate ||
          normalize(a.name).localeCompare(normalize(b.name)),
      ),
    discardReasons: [...dashboardReasons]
      .map(([name, count]) => ({ name, count, share: count / Math.max(1, wasteIncidents) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    wasteIncidents,
    wasteTrend,
    avoidableIncidents: avoidableIngredients.reduce((sum, row) => sum + row.count, 0),
    avoidableIngredients,
    insight,
  };
  return {
    meals: selected.length,
    used,
    discarded,
    synthetic: selected.some((o) => o.synthetic) || events.some((e) => e.synthetic),
    daily: [...days.values()],
    ingredients: [...legacyIngredients.values()].sort(
      (a, b) => b.count - a.count || normalize(a.name).localeCompare(normalize(b.name)),
    ),
    categories: [...legacyCategories]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    records: selected,
    dashboard,
    quantity: {
      hasData: events.length > 0,
      units: [...knownUnits],
      unitTotals: Object.fromEntries([...unitTotals]),
      wasteRates: Object.fromEntries(
        [...unitTotals].map(([key, totals]) => [
          key,
          totals.used + totals.discarded > 0
            ? totals.discarded / (totals.used + totals.discarded)
            : null,
        ]),
      ),
      trend: [...trends.values()].sort((a, b) => a.date.localeCompare(b.date)),
      ingredients: shareRows([...wasteByName.values()].sort((a, b) => b.amount - a.amount)),
      categories: shareRows([...wasteByCategory.values()].sort((a, b) => b.amount - a.amount)),
      reasons: [...reasons.values()]
        .map((row) => ({
          ...row,
          share:
            row.amount /
            Math.max(Number.EPSILON, unitTotals.get(row.unit)?.discarded ?? row.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
      inventory,
      pace: inventory.filter((item) => item.dailyRate !== null),
      slowMoving: inventory.filter(
        (item) =>
          item.quantity !== null &&
          item.quantity > 0 &&
          item.observedDays >= 14 &&
          (!item.lastUsedDate || daysBetween(item.lastUsedDate, end) > 14),
      ),
      days: daysBetween(start, end),
      eventCount: events.length,
      knownAmountEvents: events.filter((e) => e.before_quantity !== null).length,
      history: [...new Set(quantityEvents.map((event) => event.item_id))].map((itemId) => ({
        itemId,
        rows: quantityEvents
          .filter(
            (event) =>
              event.item_id === itemId && todaySingapore(new Date(event.created_at)) <= end,
          )
          .sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) || (a.sequence ?? 0) - (b.sequence ?? 0),
          )
          .map((event) => ({
            date: todaySingapore(new Date(event.created_at)),
            unit: event.unit,
            quantity: event.quantity,
          })),
      })),
      expiryBuckets: inventory.reduce(
        (buckets, item) => {
          if (item.quantity === null || item.quantity <= 0) return buckets;
          const key =
            item.daysToExpiry < 0
              ? 'Past date'
              : item.daysToExpiry <= 3
                ? '0–3 days'
                : item.daysToExpiry <= 7
                  ? '4–7 days'
                  : '8+ days';
          buckets[key] = (buckets[key] ?? 0) + 1;
          return buckets;
        },
        {} as Record<string, number>,
      ),
    },
  };
}
