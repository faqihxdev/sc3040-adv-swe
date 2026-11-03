'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChefHat } from 'lucide-react';
import type { RankedMeal } from '@/domain/model';
import { api, ApiError, message } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { InfoHelp } from './ui/info-help';

export type MealImageState = {
  image?: string;
  retrying?: boolean;
  failed?: boolean;
  error?: string;
};

type Batch = {
  abort: AbortController;
  meals: Map<string, RankedMeal>;
  queue: string[];
  queued: Set<string>;
  active: Set<string>;
  failed: Set<string>;
  retried: Set<string>;
  pump?: () => void;
};

function retryDelay(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 1_000);
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  });
}

/** Start all three dish images together; each result and retry stays independent. */
export function useMealImages(meals: RankedMeal[]) {
  const [images, setImages] = useState<Record<string, MealImageState>>({});
  const batchRef = useRef<Batch | null>(null);

  useEffect(() => {
    batchRef.current?.abort.abort();
    if (!meals.length) {
      batchRef.current = null;
      return;
    }

    const batch: Batch = {
      abort: new AbortController(),
      meals: new Map(meals.map((meal) => [meal.token, meal])),
      queue: meals.filter((meal) => meal.source !== 'saved-demo').map((meal) => meal.token),
      queued: new Set(
        meals.filter((meal) => meal.source !== 'saved-demo').map((meal) => meal.token),
      ),
      active: new Set(),
      failed: new Set(),
      retried: new Set(),
    };
    batchRef.current = batch;

    function update(token: string, image: MealImageState) {
      if (batch.abort.signal.aborted || batchRef.current !== batch) return;
      setImages((current) =>
        Object.fromEntries(
          [...batch.meals.keys()].map((key) => [key, key === token ? image : (current[key] ?? {})]),
        ),
      );
    }

    function pump() {
      while (batch.active.size < 3 && batch.queue.length && !batch.abort.signal.aborted) {
        const token = batch.queue.shift();
        if (!token) continue;
        batch.queued.delete(token);
        batch.active.add(token);
        void fetchImage(token);
      }
    }
    batch.pump = pump;

    async function fetchImage(token: string) {
      const meal = batch.meals.get(token);
      if (!meal) return;
      try {
        const result = await api<{ image: string }>(
          'meals/image',
          { token: meal.token },
          batch.abort.signal,
        );
        if (!/^data:image\/(webp|png|jpeg);base64,/.test(result.image))
          throw new Error('Invalid image.');
        batch.failed.delete(token);
        update(token, { image: result.image });
      } catch (cause) {
        if (!batch.abort.signal.aborted) {
          const temporary =
            !(cause instanceof ApiError) || cause.status === 408 || cause.status >= 500;
          if (temporary && !batch.retried.has(token)) {
            batch.retried.add(token);
            update(token, { retrying: true });
            await retryDelay(batch.abort.signal);
            if (!batch.abort.signal.aborted) {
              batch.queue.push(token);
              batch.queued.add(token);
            }
          } else {
            batch.failed.add(token);
            update(token, { failed: true, error: message(cause) });
          }
        }
      } finally {
        batch.active.delete(token);
        pump();
      }
    }

    pump();
    return () => {
      batch.abort.abort();
      batch.queue = [];
      batch.queued.clear();
      batch.active.clear();
      if (batchRef.current === batch) batchRef.current = null;
    };
  }, [meals]);

  const retry = useCallback((token: string) => {
    const batch = batchRef.current;
    if (!batch || batch.abort.signal.aborted || !batch.failed.has(token)) return;
    if (batch.active.has(token) || batch.queued.has(token)) return;
    batch.failed.delete(token);
    batch.queue.unshift(token);
    batch.queued.add(token);
    setImages((current) => ({ ...current, [token]: {} }));
    batch.pump?.();
  }, []);

  return { images, retry };
}

export function MealImage({
  meal,
  value,
  onRetry,
  className,
}: {
  meal: RankedMeal;
  value?: MealImageState;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative isolate aspect-[4/3] overflow-hidden rounded-xl bg-secondary/50',
        className,
      )}
      data-meal-image
    >
      {(meal.source === 'saved-demo' && meal.savedImage) || value?.image ? (
        <Image
          src={meal.source === 'saved-demo' && meal.savedImage ? meal.savedImage : value!.image!}
          alt={`AI illustration of ${meal.name}`}
          fill
          unoptimized
          sizes="(max-width: 767px) 100vw, 33vw"
          className="object-cover motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
        />
      ) : (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground',
            !value?.failed && 'motion-safe:animate-pulse',
          )}
        >
          <ChefHat className="size-10 stroke-[1.3]" aria-hidden="true" />
          <div className="flex items-center gap-1 text-xs">
            <p>
              {value?.failed
                ? 'Image unavailable'
                : value?.retrying
                  ? 'Retrying image'
                  : 'Creating dish image'}
            </p>
            {value?.failed && value.error && (
              <InfoHelp label={`Why is the image for ${meal.name} unavailable?`}>
                <p>{value.error}</p>
              </InfoHelp>
            )}
          </div>
          {value?.failed && onRetry && (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
              Retry image
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
