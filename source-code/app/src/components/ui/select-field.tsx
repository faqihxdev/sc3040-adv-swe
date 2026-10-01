'use client';

import { useState, useSyncExternalStore } from 'react';
import { Select } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from '../common';
import { SlidingSelection } from '../sliding-selection';

const mobileQuery = '(max-width: 639px)';
function subscribe(onChange: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const getMobile = () => window.matchMedia(mobileQuery).matches;
const getServerMobile = () => false;

export function SelectField({
  label,
  value,
  options,
  onValueChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const mobile = useSyncExternalStore(subscribe, getMobile, getServerMobile);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const triggerStyle = cn(
    'select-trigger native-select flex items-center justify-between gap-3 text-left',
    className,
  );

  if (mobile)
    return (
      <>
        <button
          type="button"
          className={triggerStyle}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <span className="truncate">{selected?.label ?? 'Choose'}</span>
          <ChevronDown
            size={16}
            className="select-chevron shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
        <Modal
          open={open}
          title={label}
          description="Select an option."
          onClose={() => setOpen(false)}
        >
          <SlidingSelection activeKey={value} className="grid gap-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'relative flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
                  option.value === value && 'font-semibold',
                )}
                aria-pressed={option.value === value}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
                {option.value === value && (
                  <Check size={18} className="shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </SlidingSelection>
        </Modal>
      </>
    );

  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      value={`v:${value}`}
      onValueChange={(next) => onValueChange(next.slice(2))}
      disabled={disabled}
    >
      <Select.Trigger className={triggerStyle} aria-label={label}>
        <span className="truncate">
          <Select.Value />
        </span>
        <Select.Icon asChild>
          <ChevronDown size={16} className="select-chevron shrink-0 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          align="start"
          className="select-options nested-surface z-[60] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <Select.ScrollUpButton className="flex h-6 items-center justify-center">
            <ChevronUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className="rounded-[var(--inset-radius)]">
            <SlidingSelection activeKey={value} highlightClassName="rounded-[var(--inset-radius)]">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={`v:${option.value}`}
                  className="relative flex min-h-11 cursor-pointer items-center rounded-[var(--inset-radius)] py-2 pr-10 pl-3 text-sm outline-none data-[state=checked]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3">
                    <Check size={16} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </SlidingSelection>
          </Select.Viewport>
          <Select.ScrollDownButton className="flex h-6 items-center justify-center">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
