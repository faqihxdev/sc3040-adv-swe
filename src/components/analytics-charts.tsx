'use client';

import { useId } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { summarize } from '@/domain/analytics';

type Buckets = ReturnType<typeof summarize>['dashboard']['wasteTrend'];
const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const tip = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--foreground)',
  fontSize: 13,
};

export function WasteTrendChart({ data }: { data: Buckets }) {
  const id = useId().replaceAll(':', '');
  return (
    <div
      className="h-full"
      role="img"
      aria-label="Recorded discard incidents over time, split into spoiled or past date, prep scraps and other"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <pattern id={`${id}-prep`} width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--chart-2)" />
              <path d="M0 6L6 0" stroke="var(--background)" strokeWidth="1" />
            </pattern>
            <pattern id={`${id}-other`} width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--chart-3)" />
              <circle cx="3" cy="3" r="1" fill="var(--background)" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={dateLabel}
            minTickGap={24}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tip}
            cursor={{ fill: 'var(--muted)' }}
            labelFormatter={(value, payload) => {
              const row = payload[0]?.payload as Buckets[number] | undefined;
              return row && row.date !== row.end
                ? `${dateLabel(row.date)} to ${dateLabel(row.end)}`
                : dateLabel(String(value));
            }}
            formatter={(value, name) => [
              `${value} ${Number(value) === 1 ? 'incident' : 'incidents'}`,
              name,
            ]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="avoidable"
            name="Spoiled / past date"
            stackId="waste"
            fill="var(--chart-1)"
            maxBarSize={44}
          />
          <Bar
            isAnimationActive={false}
            dataKey="prep"
            name="Prep scraps"
            stackId="waste"
            fill={`url(#${id}-prep)`}
            maxBarSize={44}
          />
          <Bar
            isAnimationActive={false}
            dataKey="other"
            name="Other"
            stackId="waste"
            fill={`url(#${id}-other)`}
            maxBarSize={44}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type DiscardReasons = ReturnType<typeof summarize>['dashboard']['discardReasons'];
const discardReasons = {
  spoiled: { label: 'Spoiled', fill: 'var(--chart-1)', pattern: 'solid' },
  past_date: { label: 'Past date', fill: 'var(--chart-3)', pattern: 'diagonal' },
  prep: { label: 'Prep scraps', fill: 'var(--chart-2)', pattern: 'dots' },
  other: { label: 'Other', fill: 'var(--chart-3)', pattern: 'horizontal' },
  unspecified: { label: 'Reason missing', fill: 'var(--chart-2)', pattern: 'cross' },
} as const;

export function DiscardReasonChart({ data }: { data: DiscardReasons }) {
  const id = useId().replaceAll(':', '');
  const grouped = new Map<keyof typeof discardReasons, number>();
  for (const row of data) {
    const reason = Object.hasOwn(discardReasons, row.name)
      ? (row.name as keyof typeof discardReasons)
      : 'other';
    grouped.set(reason, (grouped.get(reason) ?? 0) + row.count);
  }
  const total = [...grouped.values()].reduce((sum, count) => sum + count, 0);
  const rows = [...grouped]
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({
      reason,
      count,
      ...discardReasons[reason],
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const fillFor = (row: (typeof rows)[number]) =>
    row.pattern === 'solid' ? row.fill : `url(#${id}-${row.pattern})`;

  return (
    <figure className="flex h-full flex-col items-center gap-2">
      <figcaption className="sr-only">
        Discard reasons for {total} recorded {total === 1 ? 'incident' : 'incidents'}.
      </figcaption>
      <div className="relative min-h-36 w-full flex-1" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <defs>
              {Object.values(discardReasons)
                .filter((reason) => reason.pattern !== 'solid')
                .map((reason) => (
                  <pattern
                    key={reason.pattern}
                    id={`${id}-${reason.pattern}`}
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="6" height="6" fill={reason.fill} />
                    {reason.pattern === 'diagonal' ? (
                      <path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" stroke="var(--card)" />
                    ) : reason.pattern === 'dots' ? (
                      <circle cx="3" cy="3" r="1" fill="var(--card)" />
                    ) : reason.pattern === 'horizontal' ? (
                      <path d="M0 3H6" stroke="var(--card)" />
                    ) : (
                      <path d="M0 3H6M3 0V6" stroke="var(--card)" />
                    )}
                  </pattern>
                ))}
            </defs>
            <Pie
              data={total > 0 ? rows : [{ count: 1 }]}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="64%"
              outerRadius="94%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {total > 0 ? (
                rows.map((row) => <Cell key={row.reason} fill={fillFor(row)} />)
              ) : (
                <Cell fill="var(--border)" />
              )}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">
            {total === 1 ? 'incident' : 'incidents'}
          </span>
        </div>
      </div>
      <table className="w-full table-fixed text-xs leading-4">
        <caption className="sr-only">Discard incident counts and shares by reason</caption>
        <colgroup>
          <col />
          <col className="w-10" />
          <col className="w-12" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">Reason</th>
            <th scope="col">Incidents</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reason} className="h-5">
              <th scope="row" className="text-left font-normal">
                <span className="flex items-center gap-2">
                  <svg width="12" height="12" className="shrink-0" aria-hidden="true">
                    <rect width="12" height="12" rx="2" fill={fillFor(row)} />
                  </svg>
                  {row.label}
                </span>
              </th>
              <td className="text-right font-medium tabular-nums">{row.count}</td>
              <td className="text-right text-muted-foreground tabular-nums">{row.percentage}%</td>
            </tr>
          ))}
          {total === 0 && (
            <tr>
              <td colSpan={3} className="py-2 text-center text-muted-foreground">
                No discards recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </figure>
  );
}
