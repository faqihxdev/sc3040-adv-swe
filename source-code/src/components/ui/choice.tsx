'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Choice({
  checked,
  onCheckedChange,
  children,
  variant = 'row',
  className,
  label,
  number,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  variant?: 'row' | 'pill' | 'step';
  className?: string;
  label?: string;
  number?: number;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'choice',
        `choice-${variant}`,
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-label={label}
      />
      <span className="choice-indicator" aria-hidden="true">
        {checked ? <Check size={16} strokeWidth={2.5} /> : number}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
