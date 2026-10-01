import Link from 'next/link';
import { Boxes, CookingPot, Egg, Salad, Wheat } from 'lucide-react';
import { Brand } from './common';
import { ThemeControl } from './theme-control';
import { Button } from './ui/button';

/** Public product overview. The preview is an example, never household data. */
export function Landing() {
  return (
    <div className="landing-page">
      <a className="auth-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-header">
        <Brand />
        <Button asChild variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>
      <main id="landing-main" className="landing-main" tabIndex={-1}>
        <section className="landing-story" aria-labelledby="landing-title">
          <h1 id="landing-title" className="landing-headline">
            Cook with what you have.
          </h1>
          <p className="landing-intro">
            Your shared pantry, your next meal. Keep track of ingredients and find ways to use them.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/login">Open your kitchen</Link>
          </Button>
        </section>
        <figure className="landing-preview" aria-labelledby="preview-caption">
          <figcaption id="preview-caption" className="mb-5 text-sm text-muted-foreground">
            An example kitchen
          </figcaption>
          <div className="flex items-center gap-3 text-lg font-bold">
            <Boxes className="size-5 text-primary" aria-hidden="true" />
            Your pantry
          </div>
          <ul className="landing-pantry">
            {[
              { name: 'Tomatoes', date: 'Use first', Icon: Salad },
              { name: 'Eggs', date: 'In 2 days', Icon: Egg },
              { name: 'Rice', date: 'In 1 month', Icon: Wheat },
            ].map(({ name, date, Icon }) => (
              <li key={name}>
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="font-semibold">{name}</span>
                <span className="ml-auto text-sm text-muted-foreground">{date}</span>
              </li>
            ))}
          </ul>
          <div className="landing-meal">
            <CookingPot className="size-8 shrink-0 text-accent-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">Tonight&apos;s idea</p>
              <p className="mt-1 text-xl font-bold tracking-tight">Tomato &amp; egg rice</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Track what&apos;s used after cooking, so everyone stays up to date.
          </p>
        </figure>
      </main>
      <footer className="landing-footer">
        <p className="text-sm text-muted-foreground">Good food starts with what you have.</p>
        <ThemeControl />
      </footer>
    </div>
  );
}
