'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AppState } from '@/domain/model';
import { sharedUpdates, type InventoryHighlights } from '@/domain/shared-updates';

export function useSharedUpdates(state: AppState) {
  const previous = useRef(state);
  const [highlights, setHighlights] = useState<InventoryHighlights>({});

  useEffect(() => {
    const update = sharedUpdates(previous.current, state);
    previous.current = state;
    if (!update.notice && !Object.keys(update.highlights).length) return;
    const timer = window.setTimeout(() => {
      setHighlights(update.highlights);
      if (update.notice)
        toast(update.notice.title, {
          id: 'shared-household-update',
          description: update.notice.description || undefined,
          duration: 6000,
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!Object.keys(highlights).length) return;
    const timer = window.setTimeout(() => setHighlights({}), 6000);
    return () => window.clearTimeout(timer);
  }, [highlights]);

  return highlights;
}
