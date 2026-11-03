'use client';

import type { ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';

export function InfoHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label}>
          <Info className="size-4" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-slot="info-help"
          role="dialog"
          aria-label={label}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-24px))] max-h-[min(70dvh,var(--radix-popover-content-available-height))] origin-[var(--radix-popover-content-transform-origin)] overflow-y-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{label}</p>
            <Popover.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close help">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Popover.Close>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
