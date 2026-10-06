import type { ItemInput, Outcome, QuantityEvent, Unit } from './model';

// Synthetic expiry offsets are demo data, not food-storage advice.
export const demoIngredients: [string, number, Unit, number, string, string][] = [
  ['Thick rice noodles', 600, 'g', 4, 'Grains', 'Fridge'],
  ['Yellow noodles', 800, 'g', 5, 'Grains', 'Fridge'],
  ['Fishballs', 18, 'piece', 3, 'Protein', 'Fridge'],
  ['Prawns', 300, 'g', 2, 'Protein', 'Fridge'],
  ['Fishcake', 250, 'g', 4, 'Protein', 'Fridge'],
  ['Tofu puffs', 12, 'piece', 5, 'Protein', 'Fridge'],
  ['Bean sprouts', 180, 'g', 1, 'Vegetables', 'Fridge'],
  ['Chye sim', 250, 'g', 2, 'Vegetables', 'Fridge'],
  ['Laksa paste', 250, 'g', 45, 'Condiments', 'Pantry'],
  ['Coconut milk', 600, 'ml', 60, 'Condiments', 'Pantry'],
  ['Laksa leaves', 25, 'g', 3, 'Vegetables', 'Fridge'],
  ['Garlic', 180, 'g', 14, 'Vegetables', 'Pantry'],
  ['Shallots', 250, 'g', 14, 'Vegetables', 'Pantry'],
  ['Chicken stock', 1500, 'ml', 30, 'Condiments', 'Pantry'],
  ['Light soy sauce', 350, 'ml', 90, 'Condiments', 'Pantry'],
  ['Eggs', 2, 'piece', 10, 'Protein', 'Fridge'],
  ['Rice', 3200, 'g', 120, 'Grains', 'Pantry'],
  ['Chicken breast', 650, 'g', 3, 'Protein', 'Fridge'],
  ['Firm tofu', 400, 'g', 5, 'Protein', 'Fridge'],
  ['Minced chicken', 500, 'g', 30, 'Protein', 'Freezer'],
  ['Canned tuna', 300, 'g', 120, 'Protein', 'Pantry'],
  ['Frozen peas', 500, 'g', 60, 'Vegetables', 'Freezer'],
  ['Carrots', 450, 'g', 10, 'Vegetables', 'Fridge'],
  ['Cabbage', 800, 'g', 7, 'Vegetables', 'Fridge'],
  ['Tomatoes', 350, 'g', 4, 'Vegetables', 'Fridge'],
  ['Potatoes', 800, 'g', 14, 'Vegetables', 'Pantry'],
  ['Onion', 600, 'g', 14, 'Vegetables', 'Pantry'],
  ['Spring onions', 40, 'g', 3, 'Vegetables', 'Fridge'],
  ['Ginger', 120, 'g', 14, 'Vegetables', 'Fridge'],
  ['Cucumber', 300, 'g', 5, 'Vegetables', 'Fridge'],
  ['Mushrooms', 200, 'g', 3, 'Vegetables', 'Fridge'],
  ['Red chilli', 80, 'g', 7, 'Vegetables', 'Fridge'],
  ['Curry paste', 250, 'g', 45, 'Condiments', 'Pantry'],
  ['Pasta', 1000, 'g', 120, 'Grains', 'Pantry'],
  ['Tomato passata', 650, 'ml', 60, 'Condiments', 'Pantry'],
  ['Milk', 400, 'ml', 5, 'Dairy', 'Fridge'],
  ['Bread', 6, 'piece', 3, 'Grains', 'Pantry'],
  ['Cheese', 200, 'g', 14, 'Dairy', 'Fridge'],
  ['Oats', 800, 'g', 90, 'Grains', 'Pantry'],
  ['Bananas', 4, 'piece', 3, 'Fruit', 'Pantry'],
];

export const demoMeals = [
  {
    name: 'Singapore-style laksa',
    ingredients: [
      'Thick rice noodles',
      'Prawns',
      'Tofu puffs',
      'Bean sprouts',
      'Laksa paste',
      'Coconut milk',
      'Laksa leaves',
    ],
  },
  {
    name: 'Fishball noodle soup',
    ingredients: [
      'Yellow noodles',
      'Fishballs',
      'Fishcake',
      'Chye sim',
      'Chicken stock',
      'Light soy sauce',
    ],
  },
  {
    name: 'Prawn and fishcake fried noodles',
    ingredients: [
      'Yellow noodles',
      'Prawns',
      'Fishcake',
      'Bean sprouts',
      'Eggs',
      'Garlic',
      'Light soy sauce',
    ],
  },
  {
    name: 'Dry fishball noodles',
    ingredients: ['Yellow noodles', 'Fishballs', 'Chye sim', 'Shallots', 'Light soy sauce'],
  },
  {
    name: 'Hainanese-style chicken rice',
    ingredients: ['Rice', 'Chicken breast', 'Ginger', 'Garlic', 'Chicken stock', 'Cucumber'],
  },
  {
    name: 'Vegetable egg fried rice',
    ingredients: ['Rice', 'Eggs', 'Frozen peas', 'Carrots', 'Spring onions', 'Light soy sauce'],
  },
  {
    name: 'Tomato and egg rice',
    ingredients: ['Rice', 'Tomatoes', 'Eggs', 'Spring onions', 'Light soy sauce'],
  },
  {
    name: 'Tofu and mushroom stir-fry',
    ingredients: ['Firm tofu', 'Mushrooms', 'Chye sim', 'Garlic', 'Light soy sauce'],
  },
  {
    name: 'Chicken and potato curry',
    ingredients: ['Chicken breast', 'Potatoes', 'Curry paste', 'Coconut milk', 'Onion'],
  },
  {
    name: 'Tomato and tuna pasta',
    ingredients: ['Pasta', 'Tomato passata', 'Canned tuna', 'Onion', 'Garlic'],
  },
  {
    name: 'Banana overnight oats',
    ingredients: ['Oats', 'Milk', 'Bananas'],
  },
  {
    name: 'Cheese and egg breakfast toast',
    ingredients: ['Bread', 'Cheese', 'Eggs', 'Tomatoes'],
  },
];

const historyMealIndices = [0, 1, 3, 4, 5, 6, 7, 0, 2, 8, 9, 10, 11, 2];
const historyDays = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 26];
const recipeAmounts: Record<string, number> = {
  'Thick rice noodles': 400,
  'Yellow noodles': 400,
  Fishballs: 8,
  Prawns: 180,
  Fishcake: 120,
  'Tofu puffs': 6,
  'Bean sprouts': 120,
  'Chye sim': 150,
  'Laksa paste': 70,
  'Coconut milk': 300,
  'Laksa leaves': 10,
  Garlic: 15,
  Shallots: 35,
  'Chicken stock': 500,
  'Light soy sauce': 15,
  Eggs: 2,
  Rice: 180,
  'Chicken breast': 320,
  'Firm tofu': 250,
  'Canned tuna': 150,
  'Frozen peas': 80,
  Carrots: 80,
  Tomatoes: 180,
  Potatoes: 250,
  Onion: 100,
  'Spring onions': 20,
  Ginger: 20,
  Cucumber: 100,
  Mushrooms: 180,
  'Curry paste': 60,
  Pasta: 200,
  'Tomato passata': 300,
  Milk: 250,
  Bread: 4,
  Cheese: 60,
  Oats: 100,
  Bananas: 2,
};
type SeedItem = ItemInput & { id: string };
type PlannedEvent = {
  item: SeedItem;
  kind: QuantityEvent['kind'];
  amount: number;
  created_at: string;
  discard_reason?: QuantityEvent['discard_reason'];
  outcomeId?: string;
  expiryDate?: string;
};

export function makeDemoSeed(today: string, newId: () => string) {
  const items: SeedItem[] = demoIngredients.map(
    ([name, quantity, unit, days, category, location]) => ({
      id: newId(),
      name,
      quantity,
      unit,
      category,
      location,
      expiry_date: new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10),
    }),
  );
  const byName = new Map(items.map((item) => [item.name, item]));
  const at = (days: number, time: string) =>
    new Date(Date.parse(`${today}T${time}:00+08:00`) - days * 86400000).toISOString();
  const plans: PlannedEvent[] = [];
  const outcomes: Outcome[] = historyMealIndices.map((index, n) => {
    const recipe = demoMeals[index];
    const outcome: Outcome = {
      id: newId(),
      recipe: { name: recipe.name },
      synthetic: true,
      ingredients: [],
      created_at: at(historyDays[n], '12:00'),
    };
    for (const [ingredientIndex, name] of recipe.ingredients.entries()) {
      const item = byName.get(name)!;
      // Historical perishable batches have their own synthetic expiry snapshots.
      const perishable = Date.parse(item.expiry_date) - Date.parse(today) <= 7 * 86400000;
      const daysLeft = [0, 2, 5, 1, 7, 3][(n + ingredientIndex) % 6];
      plans.push({
        item,
        kind: 'used',
        amount: -recipeAmounts[name],
        created_at: outcome.created_at,
        outcomeId: outcome.id,
        expiryDate:
          perishable && historyDays[n] > 0
            ? at(historyDays[n] - daysLeft, '12:00').slice(0, 10)
            : item.expiry_date,
      });
    }
    return outcome;
  });
  // Fixed offsets keep resets reproducible, with quiet days and occasional fridge clear-outs.
  const waste: [number, string, number, NonNullable<QuantityEvent['discard_reason']>][] = [
    [26, 'Bean sprouts', 180, 'spoiled'],
    [26, 'Bread', 3, 'past_date'],
    [24, 'Milk', 150, 'spoiled'],
    [23, 'Tomatoes', 20, 'prep'],
    [21, 'Bananas', 1, 'past_date'],
    [21, 'Milk', 30, 'other'],
    [19, 'Onion', 15, 'prep'],
    [18, 'Mushrooms', 120, 'spoiled'],
    [16, 'Bean sprouts', 100, 'past_date'],
    [15, 'Bread', 2, 'other'],
    [13, 'Prawns', 25, 'prep'],
    [12, 'Milk', 100, 'past_date'],
    [10, 'Bean sprouts', 80, 'spoiled'],
    [9, 'Tomatoes', 15, 'prep'],
    [9, 'Mushrooms', 70, 'spoiled'],
    [5, 'Cucumber', 20, 'prep'],
    [3, 'Bread', 1, 'past_date'],
    [1, 'Chye sim', 40, 'spoiled'],
  ];
  for (const [days, name, amount, discard_reason] of waste)
    plans.push({
      item: byName.get(name)!,
      kind: 'discarded',
      amount: -amount,
      created_at: at(days, discard_reason === 'prep' ? '12:30' : '18:00'),
      discard_reason,
    });
  for (const [name, amount, days] of [
    ['Rice', 1500, 7],
    ['Eggs', 10, 27],
    ['Bean sprouts', 300, 6],
    ['Milk', 250, 7],
  ] as const)
    plans.push({ item: byName.get(name)!, kind: 'restock', amount, created_at: at(days, '09:00') });
  // Build balanced histories, including purchases, from the desired current inventory.
  const balance = new Map<string, number>();
  const events: QuantityEvent[] = items.map((item) => {
    const opening =
      item.quantity -
      plans
        .filter((event) => event.item.id === item.id)
        .reduce((sum, event) => sum + event.amount, 0);
    balance.set(item.id, opening);
    return {
      id: newId(),
      item_id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      kind: 'opening',
      amount: opening,
      before_quantity: null,
      quantity: opening,
      created_at: at(28, '08:00'),
      synthetic: true,
      discard_reason: null,
    };
  });
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  for (const plan of plans.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const before = balance.get(plan.item.id)!;
    const remaining = Math.round((before + plan.amount) * 100) / 100;
    if (remaining < 0) throw new Error(`Demo history overdraws ${plan.item.name}.`);
    balance.set(plan.item.id, remaining);
    events.push({
      id: newId(),
      item_id: plan.item.id,
      name: plan.item.name,
      category: plan.item.category,
      unit: plan.item.unit,
      kind: plan.kind,
      amount: plan.amount,
      before_quantity: before,
      quantity: remaining,
      created_at: plan.created_at,
      synthetic: true,
      discard_reason: plan.discard_reason ?? null,
    });
    if (plan.outcomeId)
      outcomeById.get(plan.outcomeId)!.ingredients.push({
        id: plan.item.id,
        name: plan.item.name,
        category: plan.item.category,
        used: true,
        discarded: false,
        unit: plan.item.unit,
        before_quantity: before,
        quantity: remaining,
        used_amount: -plan.amount,
        expiry_date: plan.expiryDate,
        discarded_amount: 0,
        discard_reason: null,
      });
  }
  return { items, outcomes, events };
}
