'use client';
import { Camera, Pencil } from 'lucide-react';
import { SlidingSelection } from './sliding-selection';
import { cn } from '@/lib/utils';

export function AddMethodTabs({
  value,
  onChange,
  id,
  disabled,
}: {
  value: 'manual' | 'photo';
  onChange: (value: 'manual' | 'photo') => void;
  id: string;
  disabled: boolean;
}) {
  const methods = [
    { value: 'manual', label: 'Manual', Icon: Pencil },
    { value: 'photo', label: 'Photo', Icon: Camera },
  ] as const;
  return (
    <div role="tablist" aria-label="Add ingredient method">
      <SlidingSelection
        activeKey={value}
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1"
        highlightClassName="bg-background shadow-sm"
      >
        {methods.map(({ value: method, label, Icon }, index) => (
          <button
            key={method}
            type="button"
            role="tab"
            id={`${id}-${method}-tab`}
            aria-controls={`${id}-${method}-panel`}
            aria-selected={value === method}
            tabIndex={value === method ? 0 : -1}
            disabled={disabled}
            className={cn(
              'relative flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50',
              value === method ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(method)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 1
                    : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                      ? 1 - index
                      : undefined;
              if (next === undefined) return;
              event.preventDefault();
              onChange(methods[next].value);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </SlidingSelection>
    </div>
  );
}
