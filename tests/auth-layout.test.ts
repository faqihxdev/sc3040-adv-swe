import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { AuthForm } from '@/components/auth-form';
import { Landing } from '@/components/landing';
import { Providers } from '@/components/providers';

describe('authentication presentation', () => {
  it('keeps sign-in focused on labelled inputs with a route back home', () => {
    const html = renderToStaticMarkup(createElement(AuthForm));
    expect(html).not.toContain('Cook with what you have.');
    expect(html).not.toContain('landing-title');
    expect(html).toContain('aria-labelledby="auth-title"');
    expect(html).toContain('Back to home');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('header-cook.webp');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('Create account');
    expect(html).toContain('Forgot password?');
  });

  it('shows a public meal example without credentials or private data', () => {
    const html = renderToStaticMarkup(createElement(Landing));
    expect(html).toContain('Cook with what you have.');
    expect(html).toContain('aria-labelledby="landing-title"');
    expect(html).toContain('aria-label="Meal ideas"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('<input');
    expect(html).toContain('<img');
  });

  it('keeps registration and recovery controls out of private-demo login', () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { demoOnly: true }));
    expect(html).not.toContain('Create account');
    expect(html).not.toContain('Forgot password?');
    expect(html).toContain('demo credentials shared by your team');
    expect(html).not.toContain('UseEatNow!2026');
  });

  it('keeps the recovery screen focused on the new password', () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { reset: true }));
    expect(html).toContain('Choose a new password');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('landing-title');
    expect(html).not.toContain('header-cook.webp');
    expect(html).not.toContain('autoComplete="email"');
  });

  it('sets dark as the default while retaining the existing preference storage key', () => {
    const html = renderToStaticMarkup(createElement(Providers, null, 'content'));
    expect(html).toContain('"class","theme","dark",null');
  });
});
