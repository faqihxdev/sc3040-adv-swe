'use client';
import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartNoAxesCombined, Utensils, Leaf, Trash2, Info } from 'lucide-react';
import type { AppState } from '@/domain/model';
import { summarize, weeklyCounts } from '@/domain/analytics';
import { todaySingapore } from '@/domain/meals';
import { Empty } from './common';
import { PageHeader } from './page-header';
import { SelectField } from './ui/select-field';
import { Choice } from './ui/choice';
import { Disclosure } from './ui/disclosure';
export function Analytics({ state }: { state: AppState }) {
  const [period, setPeriod] = useState(7);
  const [weekly, setWeekly] = useState(false);
  const end = todaySingapore();
  const start = new Date(Date.parse(end) - (period - 1) * 86400000).toISOString().slice(0, 10);
  const data = summarize(state.outcomes, start, end);
  const chartData = weekly ? weeklyCounts(data.daily) : data.daily;
  const priorEnd = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const priorStart = new Date(Date.parse(start) - period * 86400000).toISOString().slice(0, 10);
  const prior = summarize(state.outcomes, priorStart, priorEnd);
  const comparison = data.meals && prior.meals ? data.meals - prior.meals : null;
  return (
    <div className="space-y-7">
      <PageHeader
        artwork="insights"
        title="Insights"
        action={
          <label className="field">
            <span className="sr-only">Reporting period</span>
            <SelectField
              label="Reporting period"
              className="min-w-44"
              value={String(period)}
              onValueChange={(value) => setPeriod(Number(value))}
              options={[7, 30, 90].map((n) => ({ value: String(n), label: `Last ${n} days` }))}
            />
          </label>
        }
      />
      {data.synthetic && (
        <div className="flex gap-3 rounded-xl bg-secondary p-4 text-sm">
          <Info size={18} className="shrink-0" />
          <p>Includes sample data, not measured household results.</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          {
            name: 'Meals confirmed',
            shortName: 'Meals',
            value: data.meals,
            Icon: Utensils,
            detail:
              comparison === null
                ? 'No comparison available.'
                : (comparison >= 0 ? '+' : '') +
                  comparison +
                  ' recorded vs previous ' +
                  period +
                  ' days',
          },
          {
            name: 'Ingredient uses',
            shortName: 'Used',
            value: data.used,
            Icon: Leaf,
            detail: 'Ingredients marked used.',
          },
          {
            name: 'Ingredient discards',
            shortName: 'Discarded',
            value: data.discarded,
            Icon: Trash2,
            detail: 'Ingredients marked discarded.',
          },
        ].map(({ name, shortName, value, Icon, detail }) => (
          <section key={name} className="panel !p-3 sm:!p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground sm:text-sm">
                <span className="sm:hidden">{shortName}</span>
                <span className="hidden sm:inline">{name}</span>
              </h2>
              <Icon size={20} className="hidden shrink-0 sm:block" />
            </div>
            <p className="mt-2 text-3xl font-extrabold tabular-nums sm:my-4 sm:text-4xl">{value}</p>
            <p className="helper hidden sm:block">{detail}</p>
          </section>
        ))}
      </div>
      {data.meals ? (
        <>
          <section className="panel page-section">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ChartNoAxesCombined size={20} className="hidden shrink-0 sm:block" />
                  <h2 className="section-title">Used and discarded</h2>
                </div>
                <p className="helper mt-2">
                  {new Date(start).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                  {' to '}
                  {new Date(end).toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <Choice
                variant="pill"
                className="shrink-0"
                checked={weekly}
                onCheckedChange={setWeekly}
              >
                Group by week
              </Choice>
            </div>
            <div
              className="mt-6 h-72"
              role="img"
              aria-label={
                data.used +
                ' ingredient uses and ' +
                data.discarded +
                ' discards across ' +
                data.meals +
                ' meals.'
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(s) =>
                      new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
                    }
                    minTickGap={35}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--popover)',
                      border: 'none',
                      boxShadow: '0 8px 24px #0002',
                      borderRadius: 12,
                      color: 'var(--foreground)',
                    }}
                    cursor={{ fill: 'var(--muted)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar
                    dataKey="used"
                    isAnimationActive={false}
                    name="Used"
                    fill="var(--chart-1)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="discarded"
                    isAnimationActive={false}
                    name="Discarded"
                    fill="var(--chart-2)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Disclosure className="mt-4" title="View chart data">
              <div className="overflow-hidden rounded-lg">
                <div className="max-h-64 overflow-auto overscroll-contain">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Recorded ingredient events</caption>
                    <thead>
                      <tr>
                        <th className="py-2">Date</th>
                        <th>Used</th>
                        <th>Discarded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((d) => (
                        <tr key={d.date} className="even:bg-muted/60">
                          <th className="py-2 font-normal">{d.date}</th>
                          <td>{d.used}</td>
                          <td>{d.discarded}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Disclosure>
          </section>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { title: 'Most discarded ingredients', rows: data.ingredients },
              { title: 'Discarded by category', rows: data.categories },
            ].map(({ title, rows }) => (
              <section className="panel page-section" key={title}>
                <h2 className="section-title">{title}</h2>
                {rows.length ? (
                  <ol className="mt-5 space-y-4">
                    {rows.slice(0, 5).map((r) => (
                      <li key={r.name}>
                        <div className="mb-2 flex items-center gap-3 text-sm">
                          <span className="flex-1 font-semibold">{r.name}</span>
                          <span className="tabular-nums">{r.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-[var(--chart-2)]"
                            style={{
                              width: (r.count / Math.max(...rows.map((n) => n.count))) * 100 + '%',
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="helper mt-5">No discards recorded for this period.</p>
                )}
              </section>
            ))}
          </div>
          <section className="panel page-section">
            <h2 className="section-title">Recent meals</h2>
            <ul className="mt-4 space-y-1">
              {data.records.slice(0, 10).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-sm font-bold">{o.recipe.name}</p>
                    <p className="helper mt-1">
                      {o.synthetic ? 'Sample record · ' : ''}
                      {o.ingredients.filter((i) => i.used).length} used ·{' '}
                      {o.ingredients.filter((i) => i.discarded).length} discarded
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={o.created_at}>
                    {new Date(o.created_at).toLocaleDateString('en-SG', {
                      timeZone: 'Asia/Singapore',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <Empty
          title="No meals recorded"
          description="Confirm a cooking session to see it here. Unrecorded meals and waste are not included."
        />
      )}
      <Disclosure title="How counts work">
        <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Each ingredient marked used or discarded counts once per meal. An ingredient can count
            as both. These are event counts, not quantities or savings.
          </p>
          <p>
            Unrecorded meals and waste are excluded. Zero means no events were recorded, not zero
            waste.
          </p>
          <p>
            Names ignore capitalisation and surrounding spaces. Missing categories appear as
            Uncategorised. Dates use Singapore time.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
