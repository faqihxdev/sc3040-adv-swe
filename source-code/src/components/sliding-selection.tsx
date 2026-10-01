'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const itemSelector = 'button, [role="option"]';

/** A shared hover/focus highlight; selection stays exposed by the controls themselves. */
export function SlidingSelection({
  activeKey,
  className,
  highlightClassName,
  children,
}: {
  activeKey: string;
  className?: string;
  highlightClassName?: string;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);
  const lastTarget = useRef('');
  const hovered = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const group = container.current;
    const indicator = highlight.current;
    if (!group || !indicator) return;
    const selected =
      preview?.isConnected && group.contains(preview)
        ? preview
        : group.querySelector<HTMLElement>(
            '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"], [role="option"][data-state="checked"]',
          );
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function position(animate: boolean) {
      if (!group || !indicator) return;
      if (!selected || !group.offsetWidth) {
        animation.current?.cancel();
        indicator.style.opacity = '0';
        lastTarget.current = '';
        return;
      }
      const x = selected.offsetLeft;
      const y = selected.offsetTop;
      const width = selected.offsetWidth;
      const height = selected.offsetHeight;
      const target = `${x},${y},${width},${height}`;
      if (target === lastTarget.current) return;

      const previousTransform = getComputedStyle(indicator).transform;
      const previousWidth = indicator.offsetWidth;
      const previousHeight = indicator.offsetHeight;
      const wasVisible = Boolean(lastTarget.current);
      animation.current?.cancel();
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.transform = `translate(${x}px, ${y}px)`;
      indicator.style.opacity = '1';
      lastTarget.current = target;

      if (animate && wasVisible && !motion.matches) {
        animation.current = indicator.animate(
          [
            {
              transform: `${previousTransform} scale(${previousWidth / width}, ${previousHeight / height})`,
            },
            { transform: `translate(${x}px, ${y}px) scale(1)` },
          ],
          { duration: 240, easing: 'cubic-bezier(.22, 1, .36, 1)' },
        );
      }
    }

    position(true);
    const observer = new ResizeObserver(() => position(false));
    observer.observe(group);
    if (selected) observer.observe(selected);
    const stopMotion = () => {
      if (motion.matches) animation.current?.cancel();
    };
    motion.addEventListener('change', stopMotion);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', stopMotion);
    };
  }, [activeKey, preview]);

  useLayoutEffect(() => () => animation.current?.cancel(), []);

  return (
    <div
      ref={container}
      className={cn('relative isolate', className)}
      onPointerOver={(event) => {
        if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover)').matches) return;
        const item = (event.target as HTMLElement).closest<HTMLElement>(itemSelector);
        if (
          item &&
          !item.matches(':disabled, [aria-disabled="true"], [data-disabled]') &&
          event.currentTarget.contains(item)
        ) {
          hovered.current = item;
          setPreview(item);
        }
      }}
      onPointerLeave={(event) => {
        hovered.current = null;
        const focused = document.activeElement?.closest<HTMLElement>(itemSelector);
        setPreview(focused && event.currentTarget.contains(focused) ? focused : null);
      }}
      onFocusCapture={(event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>(itemSelector);
        if (item && event.currentTarget.contains(item)) setPreview(hovered.current ?? item);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPreview(hovered.current);
      }}
    >
      <span
        ref={highlight}
        aria-hidden="true"
        data-selection-highlight=""
        className={cn(
          'pointer-events-none absolute top-0 left-0 origin-top-left rounded-lg bg-secondary opacity-0',
          highlightClassName,
        )}
      />
      {children}
    </div>
  );
}
