import type { ItemInput, Outcome } from './model';

// Synthetic expiry offsets are demo data, not food-storage advice.
export const demoIngredients: [string, number, number, string, string][] = [
  ['Thick rice noodles', 4, 4, 'Grains', 'Fridge'],
  ['Yellow noodles', 4, 5, 'Grains', 'Fridge'],
  ['Fishballs', 4, 3, 'Protein', 'Fridge'],
  ['Prawns', 3, 2, 'Protein', 'Fridge'],
  ['Fishcake', 3, 4, 'Protein', 'Fridge'],
  ['Tofu puffs', 4, 5, 'Protein', 'Fridge'],
  ['Bean sprouts', 3, 1, 'Vegetables', 'Fridge'],
  ['Chye sim', 3, 2, 'Vegetables', 'Fridge'],
  ['Laksa paste', 4, 45, 'Condiments', 'Pantry'],
  ['Coconut milk', 4, 60, 'Condiments', 'Pantry'],
  ['Laksa leaves', 2, 3, 'Vegetables', 'Fridge'],
  ['Garlic', 4, 14, 'Vegetables', 'Pantry'],
  ['Shallots', 3, 14, 'Vegetables', 'Pantry'],
  ['Chicken stock', 4, 30, 'Condiments', 'Pantry'],
  ['Light soy sauce', 4, 90, 'Condiments', 'Pantry'],
  ['Eggs', 4, 10, 'Protein', 'Fridge'],
  ['Rice', 5, 120, 'Grains', 'Pantry'],
  ['Chicken breast', 4, 3, 'Protein', 'Fridge'],
  ['Firm tofu', 3, 5, 'Protein', 'Fridge'],
  ['Minced pork', 3, 30, 'Protein', 'Freezer'],
  ['Canned tuna', 4, 120, 'Protein', 'Pantry'],
  ['Frozen peas', 4, 60, 'Vegetables', 'Freezer'],
  ['Carrots', 4, 10, 'Vegetables', 'Fridge'],
  ['Cabbage', 4, 7, 'Vegetables', 'Fridge'],
  ['Tomatoes', 3, 4, 'Vegetables', 'Fridge'],
  ['Potatoes', 4, 14, 'Vegetables', 'Pantry'],
  ['Onion', 4, 14, 'Vegetables', 'Pantry'],
  ['Spring onions', 2, 3, 'Vegetables', 'Fridge'],
  ['Ginger', 3, 14, 'Vegetables', 'Fridge'],
  ['Cucumber', 3, 5, 'Vegetables', 'Fridge'],
  ['Mushrooms', 3, 3, 'Vegetables', 'Fridge'],
  ['Red chilli', 2, 7, 'Vegetables', 'Fridge'],
  ['Curry paste', 4, 45, 'Condiments', 'Pantry'],
  ['Pasta', 5, 120, 'Grains', 'Pantry'],
  ['Tomato passata', 4, 60, 'Condiments', 'Pantry'],
  ['Milk', 3, 5, 'Dairy', 'Fridge'],
  ['Bread', 3, 3, 'Grains', 'Pantry'],
  ['Cheese', 3, 14, 'Dairy', 'Fridge'],
  ['Oats', 4, 90, 'Grains', 'Pantry'],
  ['Bananas', 2, 3, 'Fruit', 'Pantry'],
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

export function makeDemoSeed(today: string, newId: () => string) {
  const items: (ItemInput & { id: string })[] = demoIngredients.map(
    ([name, stock, days, category, location]) => ({
      id: newId(),
      name,
      stock,
      category,
      location,
      expiry_date: new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10),
    }),
  );
  const outcomes: Outcome[] = Array.from({ length: 14 }, (_, n) => {
    const recipe = demoMeals[n % demoMeals.length];
    return {
      id: newId(),
      recipe: { name: recipe.name },
      synthetic: true,
      ingredients: items
        .filter((item) => recipe.ingredients.includes(item.name))
        .map((item, j) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          used: true,
          discarded: n % 3 === 0 && j === 1,
          before_stock: 4,
          stock: 3,
        })),
      created_at: new Date(
        Date.parse(today + 'T12:00:00+08:00') - (n % 12) * 86400000,
      ).toISOString(),
    };
  });
  return { items, outcomes };
}
