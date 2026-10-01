'use client';

import { useEffect, useState } from 'react';
import { CookingPot } from 'lucide-react';
import styles from './meal-generation-loading.module.css';

const phrases = [
  'A little pantry magic',
  'A pinch of inspiration',
  'Good things take thyme',
  'Rice to the occasion',
  'Leftovers deserve a second act',
  'Small ingredients. Big possibilities.',
  'From odds and ends to dinner',
  'Less waste. More taste.',
];

export function MealGenerationLoading() {
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setPhrase((current) => (current + 1) % phrases.length),
      4_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="panel mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center sm:py-12"
      role="status"
      aria-label="Finding meals"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        aria-hidden="true"
        className="relative flex size-20 items-center justify-center rounded-full bg-accent text-primary"
      >
        <div className={styles.steam}>
          <span />
          <span />
          <span />
        </div>
        <CookingPot size={36} strokeWidth={1.6} className="mt-3" />
      </div>
      <div className="w-full space-y-2">
        <p
          key={phrase}
          aria-hidden="true"
          className={`min-h-14 text-xl font-bold sm:min-h-7 ${styles.caption}`}
        >
          {phrases[phrase]}
        </p>
        <p className="min-h-10 text-sm text-muted-foreground sm:min-h-5">
          Finding meals for your ingredients.
        </p>
      </div>
    </section>
  );
}
