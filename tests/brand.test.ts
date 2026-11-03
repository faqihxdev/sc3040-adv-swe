import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Brand } from '@/components/common';

it('keeps the solid bowl mark aligned with the favicon', () => {
  const html = renderToStaticMarkup(createElement(Brand));
  const favicon = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
  const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);

  expect(paths(html)).toHaveLength(1);
  expect(paths(html)).toEqual(paths(favicon));
  expect(html).toContain('viewBox="0 0 64 64"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('UseEatNow');
  expect(html).toContain('fill="var(--primary)"');
  expect(favicon).toContain('fill="#ff8a1f"');
  expect(html).toContain('x="11" y="18" width="42" height="6" rx="3"');
  expect(favicon).toContain('x="11" y="18" width="42" height="6" rx="3"');
  expect(favicon).not.toContain('rx="20"');
  expect(html).not.toContain('lucide-leaf');
});
