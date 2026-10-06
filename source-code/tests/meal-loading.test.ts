import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MealGenerationLoading } from '../src/components/meal-generation-loading';

test('loading opens with one phrase, the meal brief and an accessible status', () => {
  const html = renderToStaticMarkup(
    createElement(MealGenerationLoading, {
      servings: 2,
      mealType: 'dinner',
      onCancel: () => undefined,
    }),
  );
  expect(html).toContain('Looking through your pantry');
  expect(html).toContain('Dinner for 2 servings');
  expect(html).toContain('Finding meals for your ingredients.');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('>Cancel</button>');
  expect(html).not.toContain('progressbar');
  expect(html).not.toContain('From your pantry');
});

test('screen readers receive real status changes without the cycling phrases', () => {
  const html = renderToStaticMarkup(createElement(MealGenerationLoading, { stage: 'validating' }));
  const status = html.match(/role="status"[^>]*>(.*?)<\/div>/)?.[1];
  expect(status).toBe('Checking recipe amounts and exclusions.');
  expect(status).not.toContain('Looking through your pantry');
});

test('cancel is available only when the caller can handle it', () => {
  const html = renderToStaticMarkup(createElement(MealGenerationLoading));
  expect(html).not.toContain('>Cancel</button>');
});
