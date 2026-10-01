import { recipeSchema, type Item, type MealRequest, type Recipe } from './model';

export const todaySingapore = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export function daysUntil(date: string, today = todaySingapore()) {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}
export function expiryPoints(item: Item, today: string) {
  const days = daysUntil(item.expiry_date, today);
  return days < 0 || item.stock === 0 ? 0 : days <= 3 ? 3 : days <= 7 ? 2 : 1;
}
export const normalize = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
const aliases: Record<string, string[]> = {
  dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee'],
  nuts: ['peanut', 'almond', 'cashew', 'walnut', 'pistachio', 'hazelnut'],
  seafood: ['fish', 'prawn', 'shrimp', 'crab', 'lobster', 'squid', 'anchovy'],
  gluten: ['wheat', 'bread', 'pasta', 'flour', 'soy sauce'],
  egg: ['egg', 'eggs'],
  soy: ['soy', 'tofu', 'tempeh'],
  vegetarian: [
    'chicken',
    'beef',
    'pork',
    'lamb',
    'fish',
    'prawn',
    'shrimp',
    'bacon',
    'ham',
    'gelatin',
  ],
  vegan: [
    'chicken',
    'beef',
    'pork',
    'lamb',
    'fish',
    'prawn',
    'shrimp',
    'bacon',
    'ham',
    'gelatin',
    'egg',
    'milk',
    'cheese',
    'butter',
    'cream',
    'yogurt',
    'honey',
  ],
};
export function matchesExclusion(text: string, exclusions: string[]) {
  const n = ` ${normalize(text)} `;
  return exclusions.some((e) =>
    [normalize(e), ...(aliases[normalize(e)] ?? [])].some(
      (term) => n.includes(` ${term} `) || n.includes(` ${term}s `),
    ),
  );
}
export function eligibleItems(
  items: Item[],
  exclusions: string[],
  excludedIds: string[],
  today: string,
) {
  return items.filter(
    (i) =>
      !i.deleted &&
      expiryPoints(i, today) > 0 &&
      !excludedIds.includes(i.id) &&
      !matchesExclusion(i.name, exclusions),
  );
}

function mentionsUnlistedIngredient(
  text: string,
  ingredients: { id: string; name: string }[],
  includedIds: Set<string>,
) {
  const prose = normalize(text);
  const mentions = ingredients
    .flatMap(({ id, name }) => {
      const words = normalize(name).split(' ').filter(Boolean);
      // Allow "rice noodles" for "thick rice noodles", keeping compound names intact.
      const forms = [
        words.join(' '),
        ...words.slice(0, -2).map((_, i) => words.slice(i + 1).join(' ')),
      ];
      return forms.filter(Boolean).flatMap((form) => {
        const singular = form.endsWith('s') && !form.endsWith('ss') ? form.slice(0, -1) : form;
        const pattern = new RegExp(`\\b${singular}s?\\b`, 'g');
        return [...prose.matchAll(pattern)].map((match) => ({
          start: match.index,
          end: match.index + match[0].length,
          listed: includedIds.has(id),
        }));
      });
    })
    .sort((a, b) => b.end - b.start - (a.end - a.start) || Number(b.listed) - Number(a.listed));
  const covered: { start: number; end: number }[] = [];
  for (const mention of mentions) {
    if (covered.some((span) => span.start <= mention.start && span.end >= mention.end)) continue;
    if (!mention.listed) return true;
    covered.push(mention);
  }
  return false;
}

export function validateAndRank(
  candidates: unknown[],
  items: Item[],
  staples: { id: string; name: string }[],
  request: MealRequest,
  exclusions: string[],
  today: string,
) {
  const eligible = eligibleItems(items, exclusions, request.excludedIds, today);
  const totalPoints = eligible.reduce((sum, i) => sum + expiryPoints(i, today), 0);
  if (!totalPoints) return [];
  const names = new Map(
    [...eligible, ...staples.filter((s) => !matchesExclusion(s.name, exclusions))].map((i) => [
      i.id,
      i.name,
    ]),
  );
  const seen = new Set<string>();
  return candidates
    .flatMap((raw) => {
      const parsed = recipeSchema.safeParse(raw);
      if (!parsed.success) return [];
      const meal = parsed.data;
      const ids = meal.ingredients.map((i) => i.ingredientId);
      if (
        meal.servings !== request.servings ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !names.has(id)) ||
        seen.has(normalize(meal.name))
      )
        return [];
      if (
        matchesExclusion(
          [meal.name, meal.summary, ...meal.steps, ...ids.map((id) => names.get(id))].join(' '),
          exclusions,
        )
      )
        return [];
      const used = eligible.filter((i) => ids.includes(i.id));
      if (!used.length) return [];
      if (
        mentionsUnlistedIngredient(
          [meal.summary, ...meal.steps].join(' '),
          [...items, ...staples],
          new Set(ids),
        )
      )
        return [];
      seen.add(normalize(meal.name));
      const points = used.reduce((sum, i) => sum + expiryPoints(i, today), 0);
      return [
        {
          ...meal,
          score: (100 * points) / totalPoints,
          points,
          totalPoints,
          coverage: used.length,
          trackedItems: used,
          ingredientNames: Object.fromEntries(names),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.coverage - a.coverage ||
        a.cookingMinutes - b.cookingMinutes ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
    .slice(0, 3);
}
export function validateChanges(
  changes: { id: string; stock: number; used: boolean; discarded: boolean }[],
  items: Item[],
) {
  if (new Set(changes.map((c) => c.id)).size !== changes.length)
    throw new Error('Each ingredient must appear once.');
  for (const c of changes) {
    const i = items.find((i) => i.id === c.id);
    if (!i) throw new Error('An ingredient is no longer available.');
    if (c.stock > i.stock) throw new Error('Remaining stock cannot increase after cooking.');
    if (c.stock !== i.stock && !c.used && !c.discarded)
      throw new Error('Mark use or discard before changing stock.');
  }
}
export type ScoredRecipe = Recipe & { score: number; points: number; totalPoints: number };
