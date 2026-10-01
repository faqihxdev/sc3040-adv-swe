import type { ReactNode, Ref } from 'react';

export function PageHeader({
  title,
  description,
  action,
  headingRef,
  artwork = 'inventory',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  artwork?: 'inventory' | 'cook' | 'insights' | 'household' | 'account';
}) {
  return (
    <header className="page-header relative isolate flex flex-wrap items-center justify-between gap-3 px-2 py-2 sm:px-0">
      <span className="page-header-art" data-artwork={artwork} aria-hidden="true" />
      <div className="relative min-w-0">
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="scroll-mt-4 rounded-sm text-3xl font-extrabold tracking-[-.045em] focus-visible:outline-2 focus-visible:outline-ring sm:text-4xl"
        >
          {title}
        </h1>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="relative shrink-0">{action}</div>}
    </header>
  );
}
