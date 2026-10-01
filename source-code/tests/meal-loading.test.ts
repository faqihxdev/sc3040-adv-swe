import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MealGenerationLoading } from '../src/components/meal-generation-loading';

test('meal loading starts with an accessible waiting state', () => {
  const html = renderToStaticMarkup(createElement(MealGenerationLoading));
  expect(html).toContain('A little pantry magic');
  expect(html).toContain('Finding meals for your ingredients.');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain('progressbar');
});
