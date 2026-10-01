'use client';
import { PageHeader } from './page-header';
import dynamic from 'next/dynamic';
import { SlidingSelection } from './sliding-selection';
import { AddMethodTabs } from './add-method-tabs';
import type { PhotoImportView } from './photo-import';
import { SelectField } from './ui/select-field';
import { useId, useRef, useState } from 'react';
import {
  Plus,
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  Undo2,
  Pencil,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, Item, ItemInput } from '@/domain/model';
import { itemInput, stockLabels } from '@/domain/model';
import { daysUntil, todaySingapore } from '@/domain/meals';
import { message } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Modal, Busy, ErrorText, Empty, Stock } from './common';
import type { Mutate } from './workspace';
const PhotoImport = dynamic(() => import('./photo-import').then((module) => module.PhotoImport), {
  loading: () => (
    <span role="status" className="sr-only">
      Opening photo picker
    </span>
  ),
});
export function Inventory({ state, mutate }: { state: AppState; mutate: Mutate }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = Number(Boolean(category)) + Number(Boolean(location));
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const pageSize = 20;
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = todaySingapore();
  const active = state.items.filter((i) => i.stock > 0);
  const soon = active.filter(
    (i) => daysUntil(i.expiry_date, today) >= 0 && daysUntil(i.expiry_date, today) <= 3,
  );
  const past = active.filter((i) => i.expiry_date < today);
  const matchingItems = state.items.filter(
    (i) =>
      (i.name + ' ' + i.category + ' ' + i.location)
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (!category || i.category === category) &&
      (!location || i.location === location),
  );
  const filterCounts = {
    all: matchingItems.length,
    soon: matchingItems.filter((i) => soon.includes(i)).length,
    past: matchingItems.filter((i) => past.includes(i)).length,
    empty: matchingItems.filter((i) => i.stock === 0).length,
  };
  const items = matchingItems
    .filter(
      (i) =>
        filter === 'all' ||
        (filter === 'soon' && soon.includes(i)) ||
        (filter === 'past' && past.includes(i)) ||
        (filter === 'empty' && i.stock === 0),
    )
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.name.localeCompare(b.name));
  const categories = [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort();
  const locations = [
    ...new Set(
      [...(state.household?.locations ?? []), ...state.items.map((i) => i.location)].filter(
        Boolean,
      ),
    ),
  ].sort();
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleItems = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function clearFilters() {
    setQuery('');
    setCategory('');
    setLocation('');
    setFilter('all');
    setPage(0);
  }
  function changePage(nextPage: number) {
    setPage(nextPage);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function openEditor(item: Item | 'new', trigger?: HTMLElement) {
    editorTrigger.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setEditing(item);
  }
  function closeEditor() {
    setEditing(null);
    editorTrigger.current?.focus({ preventScroll: true });
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError('');
    try {
      await mutate({ command: 'remove_item', id: removing.id, version: removing.version });
      setRemoving(null);
      toast.success('Ingredient removed.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    setBusy(true);
    setError('');
    try {
      await mutate({ command: 'undo' });
      toast.success('Your latest inventory edit was reversed.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        headingRef={resultsHeading}
        action={
          <Button
            aria-label="Add ingredient"
            onClick={(event) => openEditor('new', event.currentTarget)}
          >
            <Plus size={18} />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add ingredient</span>
          </Button>
        }
      />
      <section>
        <h2 className="sr-only">Ingredients</h2>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 md:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto]">
          <label className="relative md:col-start-1">
            <span className="sr-only">Search ingredients</span>
            <Search className="absolute left-3 top-3.5 text-muted-foreground" size={17} />
            <input
              className="native-select !pl-10"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search ingredients"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            className="relative md:hidden"
            aria-label={activeFilters ? `Filters, ${activeFilters} active` : 'Filters'}
            aria-expanded={showFilters}
            aria-controls="inventory-filters"
            onClick={() => setShowFilters((shown) => !shown)}
          >
            <SlidersHorizontal size={17} />
            {activeFilters > 0 && (
              <span
                className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-foreground text-[10px] text-background"
                aria-hidden="true"
              >
                {activeFilters}
              </span>
            )}
          </Button>
          <div
            id="inventory-filters"
            className={cn(
              'col-span-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 md:contents',
              showFilters ? 'grid' : 'hidden',
            )}
          >
            <SelectField
              label="Filter category"
              className="md:col-start-2 md:row-start-1"
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(0);
              }}
              options={[
                { value: '', label: 'All categories' },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
            <SelectField
              label="Filter storage"
              className="md:col-start-3 md:row-start-1"
              value={location}
              onValueChange={(value) => {
                setLocation(value);
                setPage(0);
              }}
              options={[
                { value: '', label: 'All storage' },
                ...locations.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="col-start-3 row-start-1 md:col-start-4 md:w-auto md:px-3"
            aria-label="Activity & undo"
            title="Activity & undo"
            onClick={() => {
              setHistory(true);
              setError('');
            }}
          >
            <History size={17} />
            <span className="hidden md:inline">Activity</span>
          </Button>
        </div>
        <SlidingSelection
          activeKey={filter}
          className="mb-4 grid grid-cols-4 gap-1 sm:flex sm:gap-2"
        >
          {[
            { id: 'all', label: 'All', count: filterCounts.all },
            { id: 'soon', label: 'Use soon', count: filterCounts.soon },
            { id: 'past', label: 'Past date', count: filterCounts.past },
            { id: 'empty', label: 'Empty', count: filterCounts.empty },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setFilter(t.id);
                setPage(0);
              }}
              aria-pressed={filter === t.id}
              className={cn(
                'relative flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold transition-colors sm:px-3 sm:text-sm',
                filter === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}{' '}
              <span className="font-normal tabular-nums text-muted-foreground">{t.count}</span>
            </button>
          ))}
        </SlidingSelection>
        {items.length ? (
          <div className="rounded-lg border border-border">
            {visibleItems.map((item) => (
              <IngredientRow
                key={item.id}
                item={item}
                today={today}
                onEdit={() => openEditor(item)}
                onRemove={() => {
                  setRemoving(item);
                  setError('');
                }}
              />
            ))}
          </div>
        ) : (
          <Empty
            title={state.items.length ? 'No matching ingredients' : 'No ingredients yet'}
            description={
              state.items.length
                ? 'Try another search or clear your filters.'
                : 'Add the ingredients you have, their stock levels and expiry dates.'
            }
            action={state.items.length ? 'Clear filters' : 'Add first ingredient'}
            onAction={state.items.length ? clearFilters : () => openEditor('new')}
          />
        )}
        {items.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" role="status">
              {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, items.length)} of{' '}
              {items.length} ingredients
            </p>
            {pageCount > 1 && (
              <nav className="flex items-center gap-2" aria-label="Inventory pages">
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Previous page"
                  disabled={currentPage === 0}
                  onClick={() => changePage(currentPage - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="px-2 text-sm tabular-nums">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Next page"
                  disabled={currentPage === pageCount - 1}
                  onClick={() => changePage(currentPage + 1)}
                >
                  <ChevronRight />
                </Button>
              </nav>
            )}
          </div>
        )}
        <p className="helper mt-4">
          Dates help prioritise ingredients, not judge food safety. Check storage and condition
          before cooking. Past-date and empty items are excluded from suggestions.
        </p>
      </section>
      {editing && (
        <ItemEditor
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? undefined : editing}
          state={state}
          locations={locations}
          categories={categories}
          mutate={mutate}
          close={closeEditor}
        />
      )}
      {removing && (
        <Modal
          title={'Remove ' + removing.name + '?'}
          description="This removes it from your active inventory. Your latest edit can be undone if no later change conflicts."
          onClose={() => !busy && setRemoving(null)}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>
                <Busy busy={busy}>Remove ingredient</Busy>
              </Button>
            </>
          }
        >
          <ErrorText error={error} />
        </Modal>
      )}
      {history && (
        <Modal
          title="Kitchen activity"
          description="Recent changes by your household. Undo only reverses your latest eligible inventory edit."
          onClose={() => setHistory(false)}
          footer={
            <Button variant="outline" disabled={busy} onClick={undo}>
              <Undo2 size={16} />
              <Busy busy={busy}>Undo my last edit</Busy>
            </Button>
          }
        >
          <ErrorText error={error} />
          <ol className="divide-y">
            {state.activity.map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-sm font-semibold">
                  {a.action.replaceAll('_', ' ')} · {a.label}
                </p>
                <p className="helper mt-1">
                  {state.members.find((m) => m.id === a.actor_id)?.display_name ?? 'Former member'}{' '}
                  ·{' '}
                  {new Intl.DateTimeFormat('en-SG', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Singapore',
                  }).format(new Date(a.created_at))}
                </p>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  );
}
function IngredientRow({
  item,
  today,
  onEdit,
  onRemove,
}: {
  item: Item;
  today: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const days = daysUntil(item.expiry_date, today);
  const flag =
    item.stock === 0
      ? 'Empty'
      : days < 0
        ? 'Past date'
        : days === 0
          ? 'Today'
          : days <= 3
            ? 'Use soon'
            : days <= 7
              ? 'Coming up'
              : 'Later';
  const tone =
    item.stock === 0
      ? 'bg-secondary text-secondary-foreground'
      : days < 0
        ? 'bg-[var(--danger-bg)] text-destructive'
        : days <= 3
          ? 'bg-accent text-accent-foreground'
          : 'bg-secondary text-secondary-foreground';
  const date = new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    ...(item.expiry_date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}),
  }).format(new Date(item.expiry_date));
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7rem_10rem_6rem] md:gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-bold leading-snug">{item.name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {[item.category, item.location].filter(Boolean).join(' / ') || 'Uncategorised'}
          <span className="md:hidden"> · {stockLabels[item.stock]} stock</span>
        </p>
      </div>
      <div className="hidden space-y-1.5 md:block">
        <p className="text-xs font-semibold">{stockLabels[item.stock]} stock</p>
        <Stock value={item.stock} />
      </div>
      <div className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:col-start-3 md:row-start-1 md:flex-col md:items-start">
        <span className={cn('rounded-md px-2 py-1 text-xs font-semibold', tone)}>{flag}</span>
        <time
          dateTime={item.expiry_date}
          className="text-xs text-muted-foreground"
          aria-label={'Expiry date ' + item.expiry_date}
        >
          {date}
        </time>
      </div>
      <div className="col-start-2 row-span-2 row-start-1 flex gap-2 md:col-start-4 md:row-span-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={'Edit ' + item.name}
          title={'Edit ' + item.name}
        >
          <Pencil size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-[var(--danger-bg)] hover:text-destructive"
          onClick={onRemove}
          aria-label={'Remove ' + item.name}
          title={'Remove ' + item.name}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </article>
  );
}
function ItemEditor({
  item,
  state,
  locations,
  categories,
  mutate,
  close,
}: {
  item?: Item;
  state: AppState;
  locations: string[];
  categories: string[];
  mutate: Mutate;
  close: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<ItemInput>(
    item ?? { name: '', stock: 3, expiry_date: '', category: '', location: '' },
  );
  const [review, setReview] = useState(false);
  const [open, setOpen] = useState(true);
  const [method, setMethod] = useState<'manual' | 'photo'>('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function change<K extends keyof ItemInput>(key: K, value: ItemInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function dismiss() {
    if (busy) return;
    setOpen(false);
  }
  function preview(e: React.FormEvent) {
    e.preventDefault();
    const result = itemInput.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setDraft(result.data);
    setError('');
    setReview(true);
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await mutate(
        item
          ? { command: 'edit_item', id: item.id, version: item.version, ...draft }
          : { command: 'add_item', ...draft },
      );
      toast.success(item ? 'Ingredient updated.' : 'Ingredient added.');
      setOpen(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const manualFooter = review ? (
    <>
      <Button variant="ghost" disabled={busy} onClick={() => setReview(false)}>
        Back
      </Button>
      <Button disabled={busy} onClick={save}>
        <Busy busy={busy}>Confirm {item ? 'changes' : 'ingredient'}</Busy>
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="ghost" onClick={dismiss}>
        Cancel
      </Button>
      <Button type="submit" form={formId}>
        Review details
        <ArrowUpRight size={17} />
      </Button>
    </>
  );
  const manualContent = (
    <>
      <ErrorText error={error} />
      {review ? (
        <>
          <dl className="divide-y divide-border">
            {Object.entries({
              Name: draft.name,
              Stock: stockLabels[draft.stock],
              'Expiry date': draft.expiry_date,
              Category: draft.category || 'Uncategorised',
              Storage: draft.location || 'None',
            }).map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  'grid gap-2 py-3 text-sm',
                  k !== 'Name' && 'grid-cols-[5.5rem_minmax(0,1fr)] gap-3',
                )}
              >
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn('min-w-0 font-semibold', k !== 'Name' && 'text-right')}>{v}</dd>
              </div>
            ))}
          </dl>
          {draft.expiry_date < todaySingapore() && (
            <p className="text-sm text-destructive">
              Past-date item: kept for records, excluded from meal suggestions.
            </p>
          )}
          {draft.stock === 0 && (
            <p className="text-sm font-semibold">This item will be marked empty.</p>
          )}
        </>
      ) : (
        <form id={formId} onSubmit={preview} className="space-y-5">
          <label className="field">
            Ingredient name
            <input
              className="native-select"
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              Stock level
              <SelectField
                label="Stock level"
                value={String(draft.stock)}
                onValueChange={(value) => change('stock', Number(value))}
                options={stockLabels
                  .map((label, i) => ({ value: String(i), label }))
                  .filter((_, i) => item || i > 0)}
              />
            </label>
            <label className="field">
              Expiry date
              <input
                className="native-select"
                type="date"
                required
                value={draft.expiry_date}
                onChange={(e) => change('expiry_date', e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Category <span className="sr-only">optional</span>
            <input
              className="native-select"
              maxLength={50}
              list="categories"
              placeholder="e.g. Vegetables"
              value={draft.category}
              onChange={(e) => change('category', e.target.value)}
            />
            <datalist id="categories">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </datalist>
          </label>
          <label className="field">
            Storage <span className="sr-only">optional</span>
            <input
              className="native-select"
              maxLength={50}
              list="locations"
              placeholder="e.g. Fridge"
              value={draft.location}
              onChange={(e) => change('location', e.target.value)}
            />
            <datalist id="locations">
              {locations.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </datalist>
          </label>
        </form>
      )}
    </>
  );
  function renderEditor(photo?: PhotoImportView) {
    const showingPhoto = method === 'photo' && photo;
    return (
      <Modal
        open={open && (!photo || photo.open)}
        wide={Boolean(showingPhoto)}
        title={
          showingPhoto
            ? photo.title
            : review
              ? 'Review ingredient'
              : item
                ? 'Edit ingredient'
                : 'Add ingredients'
        }
        description={
          showingPhoto
            ? photo.description
            : review
              ? 'Check the details before saving to your shared kitchen.'
              : 'Stock levels are rough bands. An expiry date is required.'
        }
        onClose={showingPhoto ? photo.onClose : dismiss}
        onAfterClose={(event) => {
          event.preventDefault();
          close();
        }}
        header={
          !item && (
            <AddMethodTabs
              id={formId}
              value={method}
              disabled={busy || Boolean(photo?.methodDisabled)}
              onChange={(next) => {
                if (next === method) return;
                photo?.cancelPending();
                setMethod(next);
              }}
            />
          )
        }
        footer={showingPhoto ? photo.footer : manualFooter}
      >
        <div
          role={!item ? 'tabpanel' : undefined}
          id={`${formId}-${method}-panel`}
          aria-labelledby={!item ? `${formId}-${method}-tab` : undefined}
          className="space-y-4"
        >
          {showingPhoto ? photo.children : manualContent}
        </div>
      </Modal>
    );
  }
  return item ? (
    renderEditor()
  ) : (
    <PhotoImport state={state} mutate={mutate} close={close} render={renderEditor} />
  );
}
