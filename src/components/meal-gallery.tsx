'use client';

import Image from 'next/image';
import { useRef, type PointerEvent } from 'react';
import styles from './meal-gallery.module.css';

const meals = [
  {
    name: 'Egg fried rice',
    ingredients: 'Rice, eggs, spring onions',
    image: 'fried-rice',
    alt: 'Fried rice topped with an egg in a green bowl.',
  },
  {
    name: 'Vegetable noodles',
    ingredients: 'Noodles, peppers, sesame',
    image: 'vegetable-noodles',
    alt: 'Stir-fried noodles with peppers and sesame on a ceramic plate.',
  },
  {
    name: 'Curry noodles',
    ingredients: 'Noodles, tofu, herbs',
    image: 'curry-noodles',
    alt: 'A bowl of curry noodles with tofu and fresh herbs.',
  },
  {
    name: 'Chicken curry',
    ingredients: 'Chicken, rice, spices',
    image: 'chicken-curry',
    alt: 'Chicken curry served with rice on a dark table.',
  },
];

function MealCard({
  meal,
  duplicate = false,
}: {
  meal: (typeof meals)[number];
  duplicate?: boolean;
}) {
  const bounds = useRef<DOMRect | null>(null);
  function move(event: PointerEvent<HTMLLIElement>) {
    if (
      event.pointerType !== 'mouse' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const rect = bounds.current;
    if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const style = event.currentTarget.style;
    style.setProperty('--tilt-x', `${-y * 8}deg`);
    style.setProperty('--tilt-y', `${x * 8}deg`);
    style.setProperty('--pan-x', `${x * 10}px`);
    style.setProperty('--pan-y', `${y * 10}px`);
  }
  function leave(event: PointerEvent<HTMLLIElement>) {
    bounds.current = null;
    for (const property of ['--tilt-x', '--tilt-y', '--pan-x', '--pan-y'])
      event.currentTarget.style.removeProperty(property);
  }
  return (
    <li
      className={styles.card}
      onPointerEnter={(event) => {
        bounds.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <div className={styles.surface}>
        <Image
          src={`/images/landing/${meal.image}.webp`}
          alt={duplicate ? '' : meal.alt}
          fill
          sizes="(max-width: 759px) 180px, 300px"
          loading="eager"
          className={styles.photo}
        />
        <div className={styles.cardText}>
          <p className={styles.mealName}>{meal.name}</p>
          <p className={styles.ingredients}>{meal.ingredients}</p>
        </div>
      </div>
    </li>
  );
}

export function MealGallery() {
  return (
    <figure className={styles.gallery} aria-label="Meal ideas" tabIndex={0}>
      <div className={styles.window}>
        {[0, 1].map((column) => (
          <div key={column} className={styles.column}>
            <div className={styles.track}>
              {[0, 1, 2, 3].map((copy) => (
                <ul key={copy} className={styles.group} aria-hidden={copy > 0 || undefined}>
                  {meals
                    .filter((_, index) => index % 2 === column)
                    .map((meal) => (
                      <MealCard key={meal.image} meal={meal} duplicate={copy > 0} />
                    ))}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
