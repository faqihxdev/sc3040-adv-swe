import { PageHeader } from './page-header';
import { cn } from '@/lib/utils';

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-secondary motion-reduce:animate-none', className)}
    />
  );
}

export function AnalyticsSkeleton() {
  return (
    <section
      className="space-y-4 [&>.page-header]:min-h-20"
      role="status"
      aria-label="Loading insights"
    >
      <PageHeader title="Insights" artwork="insights" />
      <div aria-hidden="true" className="space-y-4">
        <div className="panel">
          <Skeleton className="h-5 w-28" />
          <div className="mt-4 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <Skeleton className="h-44 lg:h-full lg:max-h-72" />
            <div className="grid gap-3">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-14" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-[23rem] rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading insights…</span>
    </section>
  );
}
