'use client';
import { PageHeader } from './page-header';
import { MealSkeleton } from './loading-skeletons';
import { PageActions } from './page-actions';
import { MealPreferences } from './meal-preferences';
import { SelectField } from './ui/select-field';
import { Choice } from './ui/choice';
import { Disclosure } from './ui/disclosure';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ChefHat,
  Clock3,
  Users,
  Check,
  RefreshCw,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, MealRequest, RankedMeal, Change, Item } from '@/domain/model';
import { stockLabels } from '@/domain/model';
import { eligibleItems, validateChanges, todaySingapore, matchesExclusion } from '@/domain/meals';
import { commonStaples, requestStaples } from '@/domain/staples';
import { api, ApiError, message } from '@/lib/api';
import { Button } from './ui/button';
import { Busy, ErrorText, Modal, Empty } from './common';
import { cn } from '@/lib/utils';

export function Meals({
  state,
  refresh,
  onKitchen,
  active,
  preferencesOpen,
  onPreferencesOpenChange,
  onShowResults,
}: {
  state: AppState;
  refresh: () => Promise<AppState>;
  onKitchen: () => void;
  active: boolean;
  preferencesOpen: boolean;
  onPreferencesOpenChange: (open: boolean) => void;
  onShowResults: () => void;
}) {
  const [request, setRequest] = useState<MealRequest>({
    servings: 2,
    mealType: 'Dinner',
    preferences: '',
    staples: commonStaples.filter((name) => !matchesExclusion(name, state.exclusions)),
    excludedIds: [],
  });
  const [stapleText, setStapleText] = useState('');
  const [meals, setMeals] = useState<RankedMeal[]>([]);
  const [detail, setDetail] = useState<RankedMeal | null>(null);
  const [selected, setSelected] = useState<RankedMeal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, setGenerated] = useState(false);
  const [discard, setDiscard] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);
  const submitted = useRef(false);
  const inFlight = useRef(false);
  const available = eligibleItems(state.items, state.exclusions, [], todaySingapore());
  const eligible = available.filter((item) => !request.excludedIds.includes(item.id));

  useEffect(() => {
    if (active && !preferencesOpen && focusRequested.current) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      focusRequested.current = false;
    }
  }, [active, preferencesOpen, selected, detail]);

  async function generate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (inFlight.current || selected || !eligible.length || !state.aiEnabled) return;
    inFlight.current = true;
    submitted.current = true;
    focusRequested.current = true;
    setBusy(true);
    setDetail(null);
    setError('');
    setNotice('');
    onPreferencesOpenChange(false);
    onShowResults();
    try {
      const result = await api<{ meals: RankedMeal[]; message: string }>('meals', {
        ...request,
        staples: requestStaples(request.staples, stapleText, state.exclusions),
      });
      setMeals(result.meals);
      setNotice(result.message);
      setGenerated(true);
    } catch (error) {
      setError(message(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function pick(meal: RankedMeal) {
    focusRequested.current = true;
    setSelected(meal);
    setMeals([]);
    setDetail(null);
    setGenerated(false);
    setNotice('');
    setError('');
  }
  function showRecipe(meal: RankedMeal | null) {
    focusRequested.current = true;
    setDetail(meal);
  }
  const recipe = selected ?? detail;
  return (
    <div className="space-y-6">
      <PageHeader
        artwork="cook"
        headingRef={heading}
        title={selected ? 'Cooking' : detail ? 'Recipe' : 'Meal suggestions'}
        action={
          !recipe && (meals.length > 0 || generated || error) ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onPreferencesOpenChange(true)}
            >
              <SlidersHorizontal size={17} /> Change preferences
            </Button>
          ) : undefined
        }
      />
      {recipe ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="panel page-section min-w-0 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!selected ? (
                <Button variant="ghost" onClick={() => showRecipe(null)}>
                  <ArrowLeft size={17} /> Back to suggestions
                </Button>
              ) : (
                <p className="eyebrow flex items-center gap-2">
                  <ChefHat size={16} /> Selected meal
                </p>
              )}
              {selected && (
                <Button variant="ghost" onClick={() => setDiscard(true)}>
                  <X size={17} /> End session
                </Button>
              )}
            </div>
            <h2 className="text-xl leading-snug font-bold sm:text-2xl">{recipe.name}</h2>
            <RecipeDetails key={recipe.token} meal={recipe} />
            <PageActions>
              <Button size="lg" onClick={() => (selected ? setConfirming(true) : pick(recipe))}>
                {selected ? 'I’ve finished cooking' : 'Cook this'}
                {selected ? <Check size={18} /> : <ChefHat size={18} />}
              </Button>
            </PageActions>
            <p className="helper">
              {selected
                ? 'Next: review ingredients used, discarded and remaining stock.'
                : 'Stock updates only after you cook and confirm.'}
            </p>
          </section>
          <aside className="panel page-section lg:bg-secondary/30">
            <h2 className="text-sm font-bold">Urgency coverage</h2>
            <p className="mt-3 text-4xl font-extrabold">
              {Math.round(recipe.score)}
              <span className="text-xl"> / 100</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Uses {recipe.coverage} tracked ingredient{recipe.coverage === 1 ? '' : 's'}.
            </p>
            <Disclosure className="mt-3" title="How the score works">
              <p className="helper">
                Recorded expiry dates contribute 3 points within 3 days, 2 within 7 days, or 1
                later. Score = recipe points ÷ all eligible points × 100. Staples do not contribute.
              </p>
            </Disclosure>
          </aside>
        </div>
      ) : busy ? (
        <MealSkeleton />
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="space-y-3">
              <ErrorText error={error} />
              <Button
                variant="secondary"
                disabled={!eligible.length || !state.aiEnabled}
                onClick={() => void generate()}
              >
                <RefreshCw size={16} /> Try again
              </Button>
            </div>
          )}
          {meals.length ? (
            <>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {meals.map((meal, index) => (
                  <article key={meal.token} className="panel flex min-w-0 flex-col">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
                        {index === 0 ? 'Best urgency match' : 'Alternative'}
                      </span>
                      <span
                        className="shrink-0 text-xl font-bold"
                        aria-label={`Urgency coverage ${Math.round(meal.score)} out of 100`}
                      >
                        {Math.round(meal.score)}
                        <span className="text-xs font-normal text-muted-foreground"> / 100</span>
                      </span>
                    </div>
                    <h2 className="text-lg leading-snug font-bold">{meal.name}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{meal.summary}</p>
                    <div className="my-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock3 size={14} />
                        {meal.cookingMinutes} min estimate
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users size={14} />
                        {meal.servings} servings
                      </span>
                      <span>{meal.coverage} tracked ingredients</span>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Button onClick={() => pick(meal)}>Cook this</Button>
                      <Button variant="ghost" onClick={() => showRecipe(meal)}>
                        See recipe
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <Disclosure title="How meals are ranked">
                <p className="helper">
                  Ranked by urgency score, ingredient coverage, estimated time, then name. Selecting
                  a meal does not deduct stock.
                </p>
              </Disclosure>
            </>
          ) : (
            !error && (
              <Empty
                title={
                  generated
                    ? 'No suitable meals'
                    : available.length
                      ? 'Cook with what you have'
                      : 'Add ingredients first'
                }
                description={
                  notice ||
                  (available.length
                    ? 'Choose from up to three meals using your ingredients.'
                    : 'Add stocked ingredients with current expiry dates to get started.')
                }
                action={
                  available.length
                    ? generated
                      ? 'Change preferences'
                      : 'Find meals'
                    : 'Go to inventory'
                }
                onAction={available.length ? () => onPreferencesOpenChange(true) : onKitchen}
              />
            )
          )}
        </div>
      )}
      <MealPreferences
        open={preferencesOpen && !selected && !busy}
        state={state}
        request={request}
        onRequestChange={setRequest}
        staples={stapleText}
        onStaplesChange={setStapleText}
        onClose={() => onPreferencesOpenChange(false)}
        onAfterClose={(event) => {
          if (submitted.current) {
            event.preventDefault();
            submitted.current = false;
            if (active) heading.current?.focus({ preventScroll: true });
          }
        }}
        onSubmit={generate}
      />
      {confirming && selected && (
        <Confirmation
          meal={selected}
          state={state}
          refresh={refresh}
          close={() => setConfirming(false)}
          complete={() => {
            setConfirming(false);
            setSelected(null);
            toast.success('Meal recorded and inventory updated.');
            onKitchen();
          }}
        />
      )}
      {discard && (
        <Modal
          title="End this cooking session?"
          description="Your selection will be discarded. No meal or inventory changes will be recorded."
          onClose={() => setDiscard(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDiscard(false)}>
                Keep cooking
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  focusRequested.current = true;
                  setSelected(null);
                  setDiscard(false);
                }}
              >
                End session
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
function RecipeDetails({ meal }: { meal: RankedMeal }) {
  const [done, setDone] = useState<number[]>([]);
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">{meal.summary}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-2">
          <Clock3 size={16} />
          {meal.cookingMinutes} min estimate
        </span>
        <span className="flex items-center gap-2">
          <Users size={16} />
          {meal.servings} servings
        </span>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Ingredients</h3>
        <ul>
          {meal.ingredients.map((i) => (
            <li key={i.ingredientId} className="flex justify-between gap-4 py-2.5 text-sm">
              <span>
                {meal.ingredientNames[i.ingredientId] ?? 'Ingredient'}
                {i.ingredientId.startsWith('staple-') && (
                  <span className="ml-2 text-xs text-muted-foreground">staple</span>
                )}
              </span>
              <span className="text-right text-muted-foreground">{i.estimatedAmount}</span>
            </li>
          ))}
        </ul>
        <p className="helper mt-2">
          Amounts are estimates. Stock bands do not establish exact quantities.
        </p>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Steps</h3>
        <ol className="space-y-3">
          {meal.steps.map((step, i) => (
            <li key={i}>
              <Choice
                variant="step"
                number={i + 1}
                label={`Step ${i + 1}: ${step}`}
                checked={done.includes(i)}
                onCheckedChange={(checked) =>
                  setDone(checked ? [...done, i] : done.filter((n) => n !== i))
                }
              >
                <span className={cn(done.includes(i) && 'text-muted-foreground line-through')}>
                  {step}
                </span>
              </Choice>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
function Confirmation({
  meal,
  state,
  refresh,
  close,
  complete,
}: {
  meal: RankedMeal;
  state: AppState;
  refresh: () => Promise<AppState>;
  close: () => void;
  complete: () => void;
}) {
  const initial = meal.trackedItems.map((i) => state.items.find((v) => v.id === i.id) ?? i);
  const [items, setItems] = useState<Item[]>(initial);
  const [changes, setChanges] = useState<Change[]>(() =>
    initial.map((i) => ({
      id: i.id,
      version: i.version,
      stock: i.stock,
      used: false,
      discarded: false,
    })),
  );
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  function update(id: string, patch: Partial<Change>) {
    setChanges((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        if (!next.used && !next.discarded) next.stock = items.find((i) => i.id === id)!.stock;
        return next;
      }),
    );
  }
  function preview() {
    try {
      validateChanges(changes, items);
      setError('');
      setReview(true);
    } catch (e) {
      setError(message(e));
    }
  }
  async function reload() {
    setBusy(true);
    try {
      const latest = await refresh();
      const current = meal.trackedItems.map((i) => latest.items.find((v) => v.id === i.id));
      if (current.some((i) => !i))
        throw new Error(
          'A recipe ingredient was removed. End this session and request fresh suggestions.',
        );
      const available = current.filter((i): i is Item => !!i);
      setItems(available);
      setChanges(
        available.map((i) => ({
          id: i.id,
          version: i.version,
          stock: i.stock,
          used: false,
          discarded: false,
        })),
      );
      setConflict(false);
      setError('');
      setReview(false);
      toast.info('Latest stock loaded. Please review your outcome again.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('confirm', { token: meal.token, changes });
      await refresh();
      complete();
    } catch (e) {
      setError(message(e));
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={review ? 'Review meal & stock' : 'Record meal'}
      description={
        review
          ? 'Only these confirmed changes will update the household.'
          : 'Review each tracked ingredient. Stock starts unchanged; choose what remains.'
      }
      onClose={() => !busy && close()}
      wide
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={review ? () => setReview(false) : close}>
            {review ? (
              <>
                <ArrowLeft size={16} />
                Back
              </>
            ) : (
              'Cancel'
            )}
          </Button>
          {conflict ? (
            <Button variant="outline" disabled={busy} onClick={reload}>
              <RefreshCw size={16} />
              Load latest stock
            </Button>
          ) : (
            <Button disabled={busy} onClick={review ? save : preview}>
              <Busy busy={busy}>{review ? 'Confirm meal & stock' : 'Preview changes'}</Busy>
              {!busy && <Check size={16} />}
            </Button>
          )}
        </>
      }
    >
      <ErrorText error={error} />
      {!conflict && (
        <div className="space-y-4">
          {changes.map((c) => {
            const item = items.find((i) => i.id === c.id)!;
            return (
              <div
                key={c.id}
                className="border-b border-border pb-4 last:border-b-0 sm:rounded-xl sm:border-0 sm:bg-muted sm:p-4"
              >
                <div className="flex justify-between gap-3">
                  <h3 className="font-bold">{item.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    Was {stockLabels[item.stock]}
                  </span>
                </div>
                {review ? (
                  <div className="mt-2 text-sm">
                    <p>
                      {c.used ? 'Used' : 'Not used'} · {c.discarded ? 'Discarded' : 'Not discarded'}
                    </p>
                    <p className={cn('mt-2 font-semibold', c.stock === 0 && 'text-destructive')}>
                      Remaining: {stockLabels[c.stock]}
                      {c.stock === 0 ? ' · marked depleted' : ''}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Usage for ${item.name}`}
                    >
                      {(['used', 'discarded'] as const).map((flag) => (
                        <Choice
                          key={flag}
                          variant="pill"
                          className="capitalize"
                          checked={c[flag]}
                          onCheckedChange={(checked) => update(c.id, { [flag]: checked })}
                        >
                          {flag}
                        </Choice>
                      ))}
                    </div>
                    <label className="field min-w-36">
                      Remaining stock
                      <SelectField
                        label={`Remaining stock for ${item.name}`}
                        value={String(c.stock)}
                        disabled={!c.used && !c.discarded}
                        onValueChange={(value) => update(c.id, { stock: Number(value) })}
                        options={stockLabels
                          .map((label, n) => ({ value: String(n), label }))
                          .filter((_, n) => n <= item.stock)}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="helper">
        Used and discarded are independent: both can apply. Selecting neither leaves stock
        unchanged. Staples are not tracked.
      </p>
    </Modal>
  );
}
