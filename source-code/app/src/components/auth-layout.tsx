import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from './common';
import { ThemeControl } from './theme-control';

/** Presentation only; authentication and recovery stay in AuthForm. */
export function AuthLayout({ children, reset = false }: { children: ReactNode; reset?: boolean }) {
  return (
    <div className="auth-page">
      <a className="auth-skip" href="#auth-form">
        {reset ? 'Skip to password reset' : 'Skip to sign in'}
      </a>
      <header className="auth-header">
        <Link href="/" aria-label="UseEatNow home" className="inline-flex min-h-11 items-center">
          <Brand />
        </Link>
        <ThemeControl />
      </header>
      <main className="auth-main">
        <Link href="/" className="auth-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
        <section id="auth-form" className="auth-panel" aria-labelledby="auth-title" tabIndex={-1}>
          {children}
        </section>
      </main>
    </div>
  );
}
