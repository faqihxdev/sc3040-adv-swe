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
    <section className="space-y-6" role="status" aria-label="Loading insights">
      <PageHeader title="Insights" artwork="insights" />
      <div aria-hidden="true" className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="panel space-y-4">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
      <span className="sr-only">Loading insights…</span>
    </section>
  );
}

export function MealSkeleton() {
  return (
    <section className="space-y-5" role="status" aria-label="Finding meals">
      <p className="text-sm text-muted-foreground">Finding meals and checking your preferences…</p>
      <div aria-hidden="true" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="panel space-y-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-4/5" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-11 w-28" />
          </div>
        ))}
      </div>
    </section>
  );
}
