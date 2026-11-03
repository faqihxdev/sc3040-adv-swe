'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCheck, FileText } from 'lucide-react';
import type { AppState } from '@/domain/model';
import { formatQuantity } from '@/domain/quantities';
import { summarize, type WasteIngredientRow } from '@/domain/analytics';
import { eligibleItems, normalize, todaySingapore } from '@/domain/meals';
import { PageHeader } from './page-header';
import { SelectField } from './ui/select-field';
import { Button } from './ui/button';
import { InfoHelp } from './ui/info-help';
import { DiscardReasonChart, WasteTrendChart } from './analytics-charts';
import { AmountRecords } from './analytics-details';
import { NearExpiry } from './near-expiry';
import expiryStyles from './expiry-outlook.module.css';

type Props = { state: AppState; onCook?: (id: string) => void; onInventory?: (id: string) => void };
type Summary = ReturnType<typeof summarize>;
const expiryBands = [
  {
    id: 'past',
    label: 'Past date',
    bucket: 'Past date',
    min: -Infinity,
    max: -1,
    color: 'bg-destructive',
    labelColor: 'text-background',
  },
  {
    id: 'soon',
    label: 'Next 3 days',
    bucket: '0–3 days',
    min: 0,
    max: 3,
    color: 'bg-primary',
    labelColor: 'text-primary-foreground',
  },
  {
    id: 'week',
    label: '4 to 7 days',
    bucket: '4–7 days',
    min: 4,
    max: 7,
    color: 'bg-[var(--chart-3)]',
    labelColor: 'text-primary-foreground',
  },
  {
    id: 'later',
    label: 'Later',
    bucket: '8+ days',
    min: 8,
    max: Infinity,
    color: 'bg-muted-foreground',
    labelColor: 'text-background',
  },
] as const;
type ExpiryBand = (typeof expiryBands)[number];
type Action = {
  key: string;
  name: string;
  amount: string;
  evidence: string;
  advice?: string;
  signal?: string;
  priority: number;
  days: number;
  id: string | null;
  cook: boolean;
};

export function Analytics({ state, onCook, onInventory }: Props) {
  const [period, setPeriod] = useState(28);
  const [showAll, setShowAll] = useState(false);
  const [records, setRecords] = useState<{
    ingredient?: Pick<WasteIngredientRow, 'name' | 'unit'>;
  } | null>(null);
  const [expiryRange, setExpiryRange] = useState<ExpiryBand['id'] | null>(null);
  const end = todaySingapore();
  const start = new Date(Date.parse(end) - (period - 1) * 86400000).toISOString().slice(0, 10);
  const data = summarize(state.outcomes, start, end, state.quantityEvents, state.items);
  const dashboard = data.dashboard;
  const cookable = new Set(
    eligibleItems(state.items, state.exclusions, [], end).map((item) => item.id),
  );
  const activeBand = expiryBands.find((band) => band.id === expiryRange);
  const actions = preventionActions(data, cookable, activeBand);
  const leaders = [...dashboard.wasteByIngredient]
    .sort(
      (a, b) =>
        b.avoidableDiscardEvents - a.avoidableDiscardEvents ||
        b.discardEvents - a.discardEvents ||
        b.wasteRate - a.wasteRate ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 4);
  return (
    <div className="space-y-4 [&>.page-header]:min-h-20 sm:[&_.page-header-art]:w-72">
      <PageHeader
        artwork="insights"
        title="Insights"
        action={
          <SelectField
            label="Reporting period"
            className="min-w-40"
            value={String(period)}
            onValueChange={(value) => setPeriod(Number(value))}
            options={[7, 28, 90].map((days) => ({
              value: String(days),
              label: `Last ${days} days`,
            }))}
          />
        }
      />
      <section className="panel min-w-0" aria-labelledby="actions-title">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="actions-title" className="section-title">
              Next actions
            </h2>
            <InfoHelp label="About next actions">
              <p>Select an expiry bar to filter stock. Select again to clear.</p>
              <p>
                Prioritises expiry, repeated spoilage and unused stock. Check food condition before
                cooking.
              </p>
              <p>Use estimates need 14 days of history and three cooking days.</p>
            </InfoHelp>
          </div>
          {actions.length > 4 && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAll}
              aria-controls="recommended-actions"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Show fewer' : `View all ${actions.length}`}
              <ChevronDown size={16} className={showAll ? 'rotate-180' : ''} />
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-6 lg:min-h-72 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <ExpiryOutlook
            data={data}
            selected={expiryRange}
            onSelect={(id) => {
              setExpiryRange((current) => (current === id ? null : id));
              setShowAll(false);
            }}
          />
          <div
            key={`${expiryRange ?? 'all'}-${showAll}`}
            id="recommended-actions"
            data-next-actions-list
            role="region"
            aria-label="Recommended actions"
            tabIndex={0}
            className="h-80 min-w-0 overflow-x-hidden overflow-y-auto rounded-lg px-1 [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:h-72"
          >
            {actions.length ? (
              <ul className="min-w-0">
                {actions.slice(0, showAll ? undefined : 4).map((action, index) => (
                  <li
                    key={action.key}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="text-sm font-bold">{action.name}</h3>
                        <span className="text-xs text-muted-foreground">{action.amount}</span>
                      </div>
                      <p
                        className={`mt-1 text-xs sm:hidden ${action.days < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {expiryLabel(action)}
                      </p>
                      {action.signal && <p className="helper mt-1">{action.signal}</p>}
                    </div>
                    <p
                      className={`hidden text-sm sm:block ${action.days < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {expiryLabel(action)}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      {(action.signal || action.priority === 0 || action.priority === 4) && (
                        <InfoHelp label={`Why ${action.name}?`}>
                          <p>{action.evidence}</p>
                          {action.advice && <p>{action.advice}</p>}
                        </InfoHelp>
                      )}
                      {action.id &&
                        (action.cook && onCook ? (
                          <Button
                            variant={index === 0 ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => onCook(action.id!)}
                          >
                            Cook
                          </Button>
                        ) : (
                          onInventory && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onInventory(action.id!)}
                            >
                              {action.amount === 'Amount needed' ? 'Set amount' : 'Review'}
                            </Button>
                          )
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-full items-center gap-3 py-5 text-muted-foreground">
                <CheckCheck size={22} aria-hidden="true" />
                <p className="text-sm">
                  {activeBand
                    ? 'No stock entries in this expiry range.'
                    : 'Your recorded stock has no urgent waste signals.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <NearExpiry data={dashboard.nearExpiry} period={period} />
        <section
          className="panel flex min-w-0 flex-col lg:row-span-2 lg:grid lg:grid-rows-subgrid"
          aria-labelledby="pattern-title"
        >
          <div className="flex min-h-11 items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="pattern-title" className="section-title">
                Waste over time
              </h2>
              <span className="helper">{period <= 7 ? 'Daily' : 'Weekly'}</span>
            </div>
            <InfoHelp label="About waste over time">
              <p>Each bar counts discard incidents across all units. Amounts stay separate.</p>
              <p>
                Daily for seven days; weekly for longer periods. Colours distinguish discard
                reasons.
              </p>
            </InfoHelp>
          </div>
          <div data-chart-area className="mt-3 flex h-64 flex-col gap-4 lg:mt-0">
            <div className="min-h-0 flex-1">
              {dashboard.wasteIncidents ? (
                <WasteTrendChart data={dashboard.wasteTrend} />
              ) : (
                <div className="grid h-full place-content-center text-center text-sm text-muted-foreground">
                  <p>No waste recorded in this period.</p>
                  <p className="helper mt-2">
                    Record discarded amounts in Inventory or after cooking.
                  </p>
                </div>
              )}
            </div>
            <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Legend mark="bg-[var(--chart-1)]" label="Spoiled / past date" />
              <Legend mark="bg-[var(--chart-2)]" label="Prep scraps" />
              <Legend mark="bg-[var(--chart-3)]" label="Other" />
            </div>
          </div>
          <div className="sr-only">
            <table>
              <caption>Waste over time</caption>
              <thead>
                <tr>
                  {[
                    'From',
                    'To',
                    'Spoiled or past date',
                    'Prep scraps',
                    'Other',
                    'Total incidents',
                  ].map((name) => (
                    <th key={name} scope="col">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.wasteTrend.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.end}</td>
                    <td>{row.avoidable}</td>
                    <td>{row.prep}</td>
                    <td>{row.other}</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section
          className="panel flex min-w-0 flex-col lg:row-span-2 lg:grid lg:grid-rows-subgrid"
          aria-labelledby="reasons-title"
        >
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 id="reasons-title" className="section-title">
              Why discarded
            </h2>
            <InfoHelp label="About why discarded">
              <p>
                Segments count incidents by reason. Spoilage and past-date discards are avoidable;
                prep scraps are separate.
              </p>
              {dashboard.wasteIncidents > 0 && (
                <p>
                  {dashboard.avoidableIncidents} of {dashboard.wasteIncidents} incidents were
                  spoiled or past date.
                </p>
              )}
            </InfoHelp>
          </div>
          <div data-chart-area className="mt-3 h-64 lg:mt-0">
            <DiscardReasonChart data={dashboard.discardReasons} />
          </div>
        </section>
        <section
          className="panel flex min-w-0 flex-col lg:row-span-2 lg:grid lg:grid-rows-subgrid"
          aria-labelledby="leaders-title"
        >
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 id="leaders-title" className="section-title">
              Waste hotspots
            </h2>
            <InfoHelp label="About waste hotspots">
              <p>Waste share = discarded ÷ (used + discarded), per ingredient and unit.</p>
              <p>Repeated spoilage ranks first. The share includes prep scraps.</p>
              <p>Small samples and missing records limit accuracy.</p>
            </InfoHelp>
          </div>
          <div data-chart-area className="mt-3 h-64 lg:mt-0">
            <WasteLeaders rows={leaders} onSelect={(ingredient) => setRecords({ ingredient })} />
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="helper">{data.synthetic ? 'Includes sample records.' : ''}</p>
        <Button variant="outline" onClick={() => setRecords({})}>
          <FileText size={16} />
          View amount records
        </Button>
      </div>
      {records && (
        <AmountRecords
          events={state.quantityEvents ?? []}
          start={start}
          end={end}
          ingredient={records.ingredient}
          onClose={() => setRecords(null)}
        />
      )}
    </div>
  );
}

function ExpiryOutlook({
  data,
  selected,
  onSelect,
}: {
  data: Summary;
  selected: ExpiryBand['id'] | null;
  onSelect: (id: ExpiryBand['id']) => void;
}) {
  const counts = expiryBands.map((band) => data.quantity.expiryBuckets[band.bucket] ?? 0);
  const maximum = Math.max(1, ...counts);
  return (
    <section
      aria-labelledby="expiry-title"
      className="flex min-w-0 flex-col border-border lg:max-h-72 lg:border-r lg:pr-6"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="expiry-title" className="text-sm font-bold">
          Expiry outlook
        </h3>
        <span className="helper">{data.dashboard.inStock} in stock</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 lg:min-h-0 lg:flex-1">
        {expiryBands.map((band, index) => (
          <button
            key={band.id}
            type="button"
            aria-label={`${band.label}, ${counts[index]} ${counts[index] === 1 ? 'item' : 'items'}`}
            aria-pressed={selected === band.id}
            onClick={() => onSelect(band.id)}
            className={`flex min-w-0 flex-col items-center rounded-lg px-1 py-2 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected === band.id ? 'bg-secondary' : ''}`}
          >
            <span
              className="flex h-12 w-full items-end justify-center lg:h-auto lg:min-h-12 lg:flex-1"
              aria-hidden="true"
            >
              <span
                data-expiry-bar
                className={`${expiryStyles.bar} w-9 rounded-t ${band.color}`}
                style={{ height: `${(counts[index] / maximum) * 100}%` }}
              >
                <span
                  data-expiry-count
                  className={`${expiryStyles.count} text-xs font-bold tabular-nums ${band.labelColor}`}
                >
                  {counts[index]}
                </span>
              </span>
            </span>
            <span className="mt-2 text-center text-[11px] leading-4 text-muted-foreground lg:min-h-8">
              {band.label}
            </span>
          </button>
        ))}
      </div>
      {data.dashboard.unmeasured > 0 && (
        <p className="helper mt-2">{data.dashboard.unmeasured} need an amount.</p>
      )}
    </section>
  );
}

function preventionActions(data: Summary, cookable: Set<string>, band?: ExpiryBand) {
  const { quantity: q, dashboard } = data;
  const byName = new Map(dashboard.repeatedWaste.map((row) => [row.key, row]));
  const unused = new Set(q.slowMoving.map((item) => item.id));
  const actions = new Map<string, Action>();
  for (const item of q.inventory) {
    if (item.quantity === 0) continue;
    if (
      band &&
      (item.quantity === null ||
        !Number.isFinite(item.daysToExpiry) ||
        item.daysToExpiry < band.min ||
        item.daysToExpiry > band.max)
    )
      continue;
    const ingredientKey = `${normalize(item.name)}:${item.unit}`;
    const key = band ? item.id : ingredientKey;
    const repeat = byName.get(ingredientKey);
    let evidence = '',
      advice = '',
      signal = '',
      priority = 9;
    if (item.quantity === null) {
      evidence = 'Set an amount for stock insights.';
      priority = 4;
    } else if (item.daysToExpiry < 0) {
      evidence = `Past date by ${Math.abs(item.daysToExpiry)} ${Math.abs(item.daysToExpiry) === 1 ? 'day' : 'days'}. Check its condition.`;
      priority = 0;
    } else if (item.daysToExpiry <= 7) {
      evidence =
        item.daysToExpiry === 0
          ? 'Expiry date is today.'
          : `${item.daysToExpiry} ${item.daysToExpiry === 1 ? 'day' : 'days'} to its expiry date.`;
      priority = 1;
    } else if (repeat) {
      evidence = `${repeat.avoidableDiscardEvents} spoilage or past-date discards. Buy a smaller amount next time.`;
      signal = `${repeat.avoidableDiscardEvents} previous discards`;
      priority = 2;
    } else if (unused.has(item.id)) {
      evidence = 'Unused for 14+ days. Check before buying more.';
      signal = 'Unused for 14+ days';
      priority = 3;
    } else if (item.daysOfCover !== null && item.daysOfCover > item.daysToExpiry + 1) {
      evidence = 'Recorded use suggests stock may outlast expiry.';
      advice = 'Cook with it before buying more.';
      signal = 'May outlast expiry';
      priority = 3;
    } else if (band) {
      evidence = `${item.daysToExpiry} days to its expiry date.`;
      priority = 5;
    }
    if (priority === 9) continue;
    if (repeat && priority < 2) {
      advice = `${repeat.avoidableDiscardEvents} previous spoilage or past-date discards. Buy less next time.`;
      signal = `${repeat.avoidableDiscardEvents} previous discards`;
    }
    const candidate = {
      key,
      name: item.name,
      amount: item.quantity === null ? 'Amount needed' : formatQuantity(item.quantity, item.unit),
      evidence,
      advice,
      signal,
      priority,
      days: item.daysToExpiry,
      id: priority === 2 && repeat && !repeat.itemId ? null : item.id,
      cook: priority !== 0 && priority !== 2 && priority !== 4 && cookable.has(item.id),
    };
    const existing = actions.get(key);
    if (
      !existing ||
      candidate.priority < existing.priority ||
      (candidate.priority === existing.priority && candidate.days < existing.days)
    )
      actions.set(key, candidate);
  }
  for (const row of band ? [] : dashboard.repeatedWaste)
    if (!actions.has(row.key))
      actions.set(row.key, {
        key: row.key,
        name: row.name,
        amount: `${formatQuantity(row.discarded, row.unit)} discarded`,
        evidence: `${row.avoidableDiscardEvents} spoilage or past-date discards. Buy a smaller amount next time.`,
        signal: `${row.avoidableDiscardEvents} previous discards`,
        priority: 2,
        days: Infinity,
        id: row.itemId,
        cook: false,
      });
  return [...actions.values()].sort(
    (a, b) => a.priority - b.priority || a.days - b.days || a.name.localeCompare(b.name),
  );
}

function expiryLabel(action: Action) {
  if (!Number.isFinite(action.days)) return '';
  if (action.days < 0)
    return `Past date by ${Math.abs(action.days)} ${action.days === -1 ? 'day' : 'days'}`;
  if (action.days === 0) return 'Expiry today';
  if (action.days === 1) return 'Expiry tomorrow';
  return `Expiry in ${action.days} days`;
}

function WasteLeaders({
  rows,
  onSelect,
}: {
  rows: WasteIngredientRow[];
  onSelect: (row: WasteIngredientRow) => void;
}) {
  return rows.length ? (
    <ol className="flex h-full flex-col justify-around gap-2">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            aria-label={`View ${row.name} records in ${row.unit}`}
            aria-haspopup="dialog"
            onClick={() => onSelect(row)}
            className="-mx-2 block min-h-11 w-[calc(100%+1rem)] cursor-pointer rounded-lg px-2 text-left transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center justify-between gap-3 text-sm font-bold">
              <span>{row.name}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {Math.round(row.wasteRate * 100)}%
                <ChevronRight size={14} aria-hidden="true" className="text-muted-foreground" />
              </span>
            </span>
            <span className="helper mt-1 block leading-4">
              {formatQuantity(row.discarded, row.unit)} discarded in {row.discardEvents}{' '}
              {row.discardEvents === 1 ? 'incident' : 'incidents'}
            </span>
            <span
              className="mt-2 block h-2 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-[var(--chart-1)]"
                style={{ width: `${row.wasteRate * 100}%` }}
              />
            </span>
          </button>
        </li>
      ))}
    </ol>
  ) : (
    <div className="grid h-full place-content-center text-center text-sm text-muted-foreground">
      Ingredient patterns appear after measured discards.
    </div>
  );
}

function Legend({ mark, label }: { mark: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2.5 rounded-sm ${mark}`} aria-hidden="true" />
      {label}
    </span>
  );
}
