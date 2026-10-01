import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Brand } from '@/components/common';

it('keeps the app logo aligned with the steaming-bowl favicon', () => {
  const html = renderToStaticMarkup(createElement(Brand));
  const favicon = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
  const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);

  expect(paths(html)).toHaveLength(3);
  expect(paths(html)).toEqual(paths(favicon));
  expect(html).toContain('viewBox="0 0 64 64"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('UseEatNow');
  expect(html).not.toContain('lucide-leaf');
});
