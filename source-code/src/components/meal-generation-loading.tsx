'use client';

import { useEffect, useState } from 'react';
import type { MealGenerationStage } from '@/domain/meal-generation';
import { Button } from './ui/button';
import styles from './meal-generation-loading.module.css';

const openingPhrases = [
  'Looking through your pantry',
  'Pairing up your ingredients',
  'Dreaming up a few dishes',
];
const waitingPhrases = [
  'A little pantry magic',
  'A pinch of inspiration',
  'Good things take thyme',
  'Rice to the occasion',
  'Leftovers deserve a second act',
  'Small ingredients. Big possibilities.',
  'From odds and ends to dinner',
  'Less waste. More taste.',
];

const statuses: Record<MealGenerationStage, string> = {
  preparing: 'Preparing your meal request.',
  generating: 'Finding meals for your ingredients.',
  validating: 'Checking recipe amounts and exclusions.',
  repairing: 'Adjusting the meal suggestions.',
  ranking: 'Ordering your meal suggestions.',
};

// Original SVG, inspired by the pan-toss motion at https://codepen.io/jkantner/pen/OJGBYJG.
function CookingAnimation() {
  return (
    <svg
      viewBox="0 0 320 220"
      width="320"
      height="220"
      aria-hidden="true"
      focusable="false"
      className={styles.kitchen}
    >
      <ellipse className={styles.shadow} cx="137" cy="195" rx="77" ry="5" />
      <g
        className={styles.steam}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M106 95c-13-13 14-19 2-33" />
        <path d="M139 83c-12-13 14-21 3-36" />
        <path d="M168 94c-10-12 12-20 3-32" />
      </g>
      <g className={styles.food}>
        <g className={styles.carrot}>
          <rect x="92" y="117" width="20" height="12" rx="4" transform="rotate(-24 102 123)" />
          <circle cx="167" cy="119" r="7" />
        </g>
        <g className={styles.leaf}>
          <path d="M121 122c-14-2-18-12-15-20 13 0 22 6 15 20Z" />
          <path d="M151 126c-2-14 7-22 18-20-1 13-8 22-18 20Z" />
        </g>
        <g className={styles.rice} strokeWidth="4" strokeLinecap="round">
          <path d="m126 132 5-3m7-14 4 2m5 18 5-2m-57 1 4 1m80-6 4-2" />
        </g>
      </g>
      <g className={styles.pan}>
        <path className={styles.handle} d="m210 137 69-24c6-2 10 8 4 11l-70 27Z" />
        <path className={styles.bowl} d="M55 136h162c-8 31-34 47-81 47S65 167 55 136Z" />
        <path className={styles.rim} d="M54 135c43 6 120 6 164 0" />
        <path className={styles.shine} d="M76 150c9 12 25 20 48 22" />
      </g>
      <g
        className={styles.heat}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M122 194v-4m15 5v-6m15 5v-4" />
      </g>
    </svg>
  );
}

export function MealGenerationLoading({
  stage = 'generating',
  servings,
  mealType,
  onCancel,
  onUseSaved,
}: {
  stage?: MealGenerationStage;
  servings?: number;
  mealType?: string;
  onCancel?: () => void;
  onUseSaved?: () => void;
}) {
  const [phrase, setPhrase] = useState(0);
  const [takingLonger, setTakingLonger] = useState(false);
  const caption =
    phrase < openingPhrases.length
      ? openingPhrases[phrase]
      : waitingPhrases[phrase - openingPhrases.length];
  const brief = [
    mealType && `${mealType[0].toUpperCase()}${mealType.slice(1)}`,
    servings && `${servings} serving${servings === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' for ');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhrase((current) => {
        const next = current + 1;
        return next < openingPhrases.length + waitingPhrases.length ? next : openingPhrases.length;
      });
    }, 4_000);
    const slowTimer = window.setTimeout(() => setTakingLonger(true), 30_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(slowTimer);
    };
  }, []);

  return (
    <section
      className="panel mx-auto flex max-w-xl flex-col items-center py-8 text-center sm:py-10"
      aria-label="Meal planning"
    >
      <CookingAnimation />
      <div className="mt-2 grid min-h-14 w-full items-center">
        <h2 key={phrase} className={`text-xl leading-snug font-bold sm:text-2xl ${styles.caption}`}>
          {caption}
        </h2>
      </div>
      {brief && <p className="mt-1 text-sm text-muted-foreground">{brief}</p>}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {takingLonger ? `Still working. ${statuses[stage]}` : statuses[stage]}
      </div>
      <p className="mt-5 min-h-5 text-xs text-muted-foreground">
        {takingLonger ? 'Still working on your meal ideas.' : '\u00a0'}
      </p>
      {onCancel && (
        <Button type="button" variant="outline" className="mt-3 min-w-28" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {takingLonger && onUseSaved && (
        <Button type="button" variant="ghost" className="mt-2" onClick={onUseSaved}>
          Use saved demo recipes
        </Button>
      )}
    </section>
  );
}
