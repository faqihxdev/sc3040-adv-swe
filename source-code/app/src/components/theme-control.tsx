'use client';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
const subscribe = () => () => {};
export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div
      className="nested-surface flex w-fit shrink-0 gap-1 bg-muted"
      role="group"
      aria-label="Colour theme"
    >
      {[
        { value: 'light', Icon: Sun },
        { value: 'dark', Icon: Moon },
        { value: 'system', Icon: Monitor },
      ].map(({ value, Icon }) => (
        <button
          key={value}
          type="button"
          title={value + ' theme'}
          aria-label={value + ' theme'}
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
          className="grid size-11 place-items-center rounded-[var(--inset-radius)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          <Icon size={17} />
        </button>
      ))}
    </div>
  );
}
