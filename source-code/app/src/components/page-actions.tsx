'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Keeps a page's primary action above mobile navigation and the onscreen keyboard. */
export function PageActions({
  children,
  className,
  pinned = true,
  variant = 'bar',
}: {
  children: ReactNode;
  className?: string;
  pinned?: boolean;
  variant?: 'bar' | 'floating';
}) {
  const space = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const navigation = document.querySelector<HTMLElement>('[data-mobile-nav]');
    const viewport = window.visualViewport;
    function measure() {
      if (!bar.current || !space.current) return;
      const keyboard = Math.max(
        0,
        window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0),
      );
      const bottom = Math.max(navigation?.getBoundingClientRect().height ?? 0, keyboard);
      bar.current.style.setProperty('--actions-bottom', `${bottom}px`);
      space.current
        .closest<HTMLElement>('.view-panel')
        ?.style.setProperty(
          '--actions-clearance',
          `${bar.current.getBoundingClientRect().height + (variant === 'floating' ? 16 : 0)}px`,
        );
    }
    const observer = new ResizeObserver(measure);
    if (navigation) observer.observe(navigation);
    if (bar.current) observer.observe(bar.current);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [variant]);
  return (
    <div ref={space} className={cn(pinned && 'page-actions-space', className)}>
      <div
        ref={bar}
        className={cn(
          'flex flex-wrap items-center gap-3',
          pinned && 'page-actions',
          pinned && variant === 'floating' && 'page-actions-floating',
        )}
      >
        {children}
      </div>
    </div>
  );
}
