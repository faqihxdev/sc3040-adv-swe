'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { summarizeNearExpiry } from '@/domain/expiry-insights';
import { formatQuantity } from '@/domain/quantities';
import { Modal } from './common';
import { Button } from './ui/button';
import { InfoHelp } from './ui/info-help';

const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function NearExpiry({
  data,
  period,
}: {
  data: ReturnType<typeof summarizeNearExpiry>;
  period: number;
}) {
  const [details, setDetails] = useState(false);
  return (
    <section
      className="panel flex min-w-0 flex-col lg:row-span-2 lg:grid lg:grid-rows-subgrid"
      aria-labelledby="near-expiry-title"
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="near-expiry-title" className="section-title">
            Used near expiry
          </h2>
          <span className="helper">{period <= 7 ? 'Daily' : 'Weekly'}</span>
        </div>
        <InfoHelp label="About used near expiry">
          <p>
            Counts each ingredient used in a confirmed meal, from its expiry day to three days
            before.
          </p>
          <p>Uses the expiry date saved at confirmation. Amounts stay in their recorded units.</p>
          <p>
            {data.trackedUses} tracked ingredient uses. {data.untrackedUses} untracked uses are
            excluded.
          </p>
        </InfoHelp>
      </div>
      <div data-chart-area className="mt-3 flex h-64 flex-col gap-4 lg:mt-0">
        {data.trackedUses ? (
          <div
            className="min-h-0 flex-1"
            role="img"
            aria-label={`${data.count} ingredient uses within three days of expiry in the selected period`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
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
                  cursor={{ fill: 'var(--muted)' }}
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--foreground)',
                    fontSize: 13,
                  }}
                  labelFormatter={(value) => {
                    const row = data.trend.find((bucket) => bucket.date === String(value));
                    return row && row.date !== row.end
                      ? `${dateLabel(row.date)} to ${dateLabel(row.end)}`
                      : dateLabel(String(value));
                  }}
                  formatter={(value) => [String(value), 'Ingredient uses']}
                />
                <Bar
                  dataKey="count"
                  name="Ingredient uses"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="helper grid flex-1 place-content-center text-center">
            Confirm a meal to start tracking expiry at cooking.
          </p>
        )}
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              <span
                className="mr-1 text-xl font-semibold text-foreground tabular-nums"
                data-near-expiry-count
              >
                {data.count}
              </span>
              ingredient {data.count === 1 ? 'use' : 'uses'}
            </p>
            {data.untrackedUses > 0 && (
              <p className="helper">{data.untrackedUses} uses untracked</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={data.count === 0}
            onClick={() => setDetails(true)}
          >
            View ingredients
          </Button>
        </div>
      </div>
      <table className="sr-only">
        <caption>Used near expiry over time</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Ingredient uses</th>
          </tr>
        </thead>
        <tbody>
          {data.trend.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{row.end}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {details && (
        <Modal
          title="Used near expiry"
          description="Confirmed amounts and the expiry dates saved when cooking."
          onClose={() => setDetails(false)}
          footer={
            <Button variant="secondary" onClick={() => setDetails(false)}>
              Close
            </Button>
          }
        >
          <ul aria-label="Near-expiry ingredient uses" className="divide-y divide-border">
            {data.records.map((row) => (
              <li key={row.id} className="py-3 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{row.name}</h3>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatQuantity(row.amount, row.unit)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{row.recipe}</p>
                <p className="helper mt-1">
                  <time dateTime={row.date}>{dateLabel(row.date)}</time>.{' '}
                  {row.daysLeft === 0
                    ? 'Used on expiry day'
                    : `${row.daysLeft} ${row.daysLeft === 1 ? 'day' : 'days'} before expiry`}
                  .
                </p>
                <p className="helper">
                  Expiry <time dateTime={row.expiryDate}>{row.expiryDate}</time>
                </p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}
