'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { LoaderCircle, Leaf } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-extrabold tracking-tight text-xl">
      <svg className="size-9 shrink-0" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <g fill="var(--primary)">
          <rect x="11" y="18" width="42" height="6" rx="3" />
          <path d="M11 29H53C52 43 44 52 32 52S12 43 11 29Z" />
        </g>
      </svg>
      UseEatNow
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  footer,
  header,
  onClose,
  open = true,
  wide = false,
  onAfterClose,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  onClose: () => void;
  open?: boolean;
  wide?: boolean;
  onAfterClose?: (event: Event) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previousTitle = useRef(title);
  useEffect(() => {
    if (previousTitle.current !== title && document.activeElement?.getAttribute('role') !== 'tab')
      heading.current?.focus();
    previousTitle.current = title;
  }, [title]);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    function resize() {
      const height = viewport?.height ?? window.innerHeight;
      const offset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      content.current?.style.setProperty('--dialog-visible-height', `${height}px`);
      content.current?.style.setProperty('--dialog-keyboard-offset', `${offset}px`);
    }
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        ref={content}
        className="responsive-dialog"
        data-wide={wide || undefined}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (window.matchMedia('(max-width: 639px)').matches) {
            event.preventDefault();
            heading.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          onAfterClose?.(event);
          if (!event.defaultPrevented && returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <DialogHeader className="shrink-0 px-4 pt-5 pb-4 pr-16 text-left sm:px-6 sm:pt-6 sm:pr-16">
          <DialogTitle
            ref={heading}
            tabIndex={-1}
            className="rounded-sm text-xl leading-snug focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {header && <div className="shrink-0 px-4 pb-4 sm:px-6">{header}</div>}
        {children && (
          <div
            data-dialog-scroll
            className={cn(
              'min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pt-1 sm:px-6',
              footer ? 'pb-4' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6',
            )}
          >
            {children}
          </div>
        )}
        {footer && (
          <div
            data-dialog-actions
            className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/60 bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5"
          >
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      {busy && <LoaderCircle className="animate-spin" size={16} />} {children}
    </>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="error-box">
      {error}
    </p>
  ) : null;
}
export function Empty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel page-section page-section-empty flex flex-col items-center text-center lg:p-10">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Leaf size={28} />
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="helper mt-2 max-w-sm">{description}</p>
      {action && (
        <Button className="mt-5" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
export function Stock({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn('h-1.5 w-3 rounded-full bg-border', n <= value && 'bg-foreground/70')}
        />
      ))}
    </span>
  );
}
