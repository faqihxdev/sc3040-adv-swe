import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Disclosure({
  title,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <details className={cn('disclosure nested-surface bg-muted/60', className)}>
      <summary className="disclosure-trigger">
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="disclosure-chevron shrink-0" size={18} aria-hidden="true" />
      </summary>
      <div className={cn('px-3 pt-2 pb-3', contentClassName)}>{children}</div>
    </details>
  );
}
