'use client';
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
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, MealRequest, RankedMeal } from '@/domain/model';
import type { MealGenerationStage } from '@/domain/meal-generation';
import type { MealGenerationResult } from '@/domain/meal-generation';
import { formatQuantity } from '@/domain/quantities';
import { daysUntil, eligibleItems, todaySingapore, matchesExclusion } from '@/domain/meals';
import { commonStaples, requestStaples } from '@/domain/staples';
import { generateMeals } from '@/lib/meal-generation';
import { api, message } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from './page-header';
import { MealGenerationLoading } from './meal-generation-loading';
import { MealImage, useMealImages } from './meal-image';
import { MealConfirmation } from './meal-confirmation';
import { PageActions } from './page-actions';
import { MealPreferences } from './meal-preferences';
import { Choice } from './ui/choice';
import { InfoHelp } from './ui/info-help';
import { Button } from './ui/button';
import { ErrorText, Modal, Empty } from './common';

function usedSoon(meal: RankedMeal) {
  return meal.trackedItems
    .filter((item) => daysUntil(item.expiry_date) <= 3)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
}
function SavedDemoAction({ waiting, onClick }: { waiting: boolean; onClick: () => void }) {
  const [ready, setReady] = useState(!waiting);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setReady(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  return (
    <div className="mt-auto flex min-h-11 justify-end">
      {ready && (
        <button
          type="button"
          aria-label="Use saved demo recipes"
          onClick={onClick}
          className="group inline-flex min-h-11 cursor-pointer items-center rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span
            aria-hidden="true"
            className="translate-x-1 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            Use saved
          </span>
          <span className="grid size-11 place-items-center" aria-hidden="true">
            <BookOpen size={17} />
          </span>
        </button>
      )}
    </div>
  );
}
function MealContext({ meal }: { meal: RankedMeal }) {
  const soon = usedSoon(meal);
  return (
    <div className="space-y-1" data-meal-context>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Expiry coverage{' '}
          <span className="ml-1 text-base font-bold text-accent-foreground tabular-nums">
            {Math.round(meal.score)}%
          </span>
        </p>
        <InfoHelp label={`Why ${meal.name}?`}>
          <p className="font-bold tabular-nums">
            {meal.points} ÷ {meal.totalPoints} × 100 ≈ {Math.round(meal.score)}%
          </p>
          <p>Recipe points ÷ eligible pantry points, using stock at generation.</p>
          <p>
            Within 3 days: 3 points. Within 4 to 7 days: 2. Later: 1. Covers {meal.coverage}{' '}
            ingredient{meal.coverage === 1 ? '' : 's'}, regardless of amount used. Staples are
            excluded.
          </p>
          <p>Ties favour more ingredients, then shorter cooking time.</p>
          <p>
            Amounts and exclusions passed automated checks. Check food safety and actual amounts.
            Recipes and images are AI generated.
          </p>
        </InfoHelp>
      </div>
      <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        {soon.length
          ? `Uses soon: ${soon
              .slice(0, 2)
              .map((item) => item.name)
              .join(', ')}${soon.length > 2 ? ` +${soon.length - 2}` : ''}`
          : `Uses ${meal.coverage} inventory ingredient${meal.coverage === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

export function Meals({
  state,
  refresh,
  onKitchen,
  active,
  preferencesOpen,
  onPreferencesOpenChange,
  onShowResults,
  preferredIngredientId,
}: {
  state: AppState;
  refresh: () => Promise<AppState>;
  onKitchen: () => void;
  active: boolean;
  preferencesOpen: boolean;
  onPreferencesOpenChange: (open: boolean) => void;
  onShowResults: () => void;
  preferredIngredientId?: string | null;
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
  const [imageMeals, setImageMeals] = useState<RankedMeal[]>([]);
  const { images, retry: retryImage } = useMealImages(imageMeals);
  const [detail, setDetail] = useState<RankedMeal | null>(null);
  const [selected, setSelected] = useState<RankedMeal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [stage, setStage] = useState<MealGenerationStage>('preparing');
  const [brief, setBrief] = useState<{
    servings: number;
    mealType: string;
  }>({ servings: 2, mealType: 'Dinner' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, setGenerated] = useState(false);
  const [discard, setDiscard] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);
  const submitted = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const available = eligibleItems(state.items, state.exclusions, [], todaySingapore());
  const eligible = available.filter((item) => !request.excludedIds.includes(item.id));
  const [lastPreferredId, setLastPreferredId] = useState(preferredIngredientId);
  if (lastPreferredId !== preferredIngredientId) {
    setLastPreferredId(preferredIngredientId);
    const preferred = available.find((item) => item.id === preferredIngredientId);
    if (preferred)
      setRequest((current) => ({ ...current, preferences: `Use ${preferred.name} if possible` }));
  }
  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (active && !preferencesOpen && focusRequested.current) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      focusRequested.current = false;
    }
  }, [active, preferencesOpen, selected, detail, busy]);

  async function generate(event?: FormEvent<HTMLFormElement>, saved = false) {
    event?.preventDefault();
    if (
      selected ||
      (saved
        ? !state.demoMealsEnabled || loadingSaved
        : inFlight.current || !eligible.length || !state.aiEnabled)
    )
      return;
    if (saved) inFlight.current?.abort();
    const abort = new AbortController();
    inFlight.current = abort;
    submitted.current = true;
    focusRequested.current = true;
    setBusy(true);
    setLoadingSaved(saved);
    if (saved) setImageMeals([]);
    setStage('preparing');
    setBrief({ servings: request.servings, mealType: request.mealType });
    setDetail(null);
    setError('');
    setNotice('');
    onPreferencesOpenChange(false);
    onShowResults();
    try {
      const input = {
        ...request,
        staples: requestStaples(request.staples, stapleText, state.exclusions),
      };
      const result = saved
        ? await api<MealGenerationResult>('meals/demo', input, abort.signal)
        : await generateMeals(
            input,
            (value) => {
              if (!abort.signal.aborted) setStage(value);
            },
            abort.signal,
          );
      if (abort.signal.aborted) return;
      setMeals(result.meals);
      setImageMeals(result.meals);
      setNotice(result.message);
      setGenerated(true);
      focusRequested.current = true;
    } catch (cause) {
      if (!abort.signal.aborted) setError(message(cause));
    } finally {
      if (inFlight.current === abort) {
        inFlight.current = null;
        setBusy(false);
        setLoadingSaved(false);
      }
    }
  }
  function cancelGeneration() {
    inFlight.current?.abort();
    setNotice('Generation cancelled. Your inventory is unchanged.');
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
  const savedResults = (recipe ?? meals[0])?.source === 'saved-demo';
  return (
    <div className="flex min-h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top))-7rem)] flex-col gap-5 sm:min-h-[calc(100dvh-9rem)] lg:min-h-[calc(100dvh-5rem)]">
      <PageHeader
        artwork="cook"
        headingRef={heading}
        title={selected ? 'Cooking' : detail ? 'Recipe' : 'Meal suggestions'}
        action={
          !recipe && !busy && (meals.length > 0 || generated || error) ? (
            <Button variant="secondary" onClick={() => onPreferencesOpenChange(true)}>
              <SlidersHorizontal size={17} /> Change preferences
            </Button>
          ) : undefined
        }
      />
      {savedResults && !busy && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <span>Saved demo recipes</span>
          <InfoHelp label="About saved demo recipes">
            <p>
              Generated in advance for the demo. Stock, exclusions and expiry scores are checked
              again when loaded.
            </p>
          </InfoHelp>
        </div>
      )}
      {recipe ? (
        <section className="panel page-section min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!selected ? (
              <Button variant="ghost" onClick={() => showRecipe(null)}>
                <ArrowLeft size={17} /> Back to suggestions
              </Button>
            ) : (
              <p className="eyebrow flex items-center gap-2">
                <ChefHat size={16} /> Cooking session
              </p>
            )}
            {selected && (
              <Button variant="ghost" onClick={() => setDiscard(true)}>
                <X size={17} /> End session
              </Button>
            )}
          </div>
          <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-3">
              <h2 className="text-xl leading-snug font-bold sm:text-2xl">{recipe.name}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{recipe.summary}</p>
              <RecipeMeta meal={recipe} />
              <MealContext meal={recipe} />
            </div>
            <MealImage
              meal={recipe}
              value={images[recipe.token]}
              onRetry={() => retryImage(recipe.token)}
              className={cn(
                'mx-auto w-full max-w-sm sm:max-w-none',
                selected && 'max-sm:aspect-auto max-sm:h-40 max-sm:max-w-none',
              )}
            />
          </div>
          <RecipeDetails
            key={`${selected ? 'cooking' : 'preview'}-${recipe.token}`}
            meal={recipe}
            cooking={Boolean(selected)}
          />
          <PageActions>
            <Button
              size="lg"
              className="max-sm:w-full"
              onClick={() => (selected ? setConfirming(true) : pick(recipe))}
            >
              {selected ? 'I’ve finished cooking' : 'Cook this'}
              {selected ? <Check size={18} /> : <ChefHat size={18} />}
            </Button>
          </PageActions>
          <p className="helper">
            {selected
              ? 'Adjust actual amounts, then confirm.'
              : 'Stock updates after you cook and confirm.'}
          </p>
        </section>
      ) : busy && loadingSaved ? (
        <section className="panel py-10 text-center text-sm text-muted-foreground" role="status">
          Loading saved recipes…
        </section>
      ) : busy ? (
        <MealGenerationLoading
          stage={stage}
          servings={brief.servings}
          mealType={brief.mealType}
          onCancel={cancelGeneration}
        />
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="space-y-3">
              <ErrorText error={error} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={!eligible.length || !state.aiEnabled}
                  onClick={() => void generate()}
                >
                  <RefreshCw size={16} /> Try again
                </Button>
              </div>
            </div>
          )}
          {notice && (meals.length > 0 || error) && (
            <p role="status" className="helper">
              {notice}
            </p>
          )}
          {meals.length ? (
            <>
              <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                {meals.map((meal, index) => (
                  <article
                    key={meal.token}
                    className="panel row-span-6 grid min-w-0 grid-rows-subgrid gap-y-3 !p-3 sm:!p-4"
                  >
                    <div className="relative self-start">
                      <MealImage
                        meal={meal}
                        value={images[meal.token]}
                        onRetry={() => retryImage(meal.token)}
                      />
                      {index === 0 && usedSoon(meal).length > 0 && (
                        <span className="absolute top-3 left-3 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
                          Use first
                        </span>
                      )}
                    </div>
                    <h2 className="px-1 text-lg leading-snug font-bold">{meal.name}</h2>
                    <p className="px-1 text-sm leading-relaxed text-muted-foreground">
                      {meal.summary}
                    </p>
                    <div className="px-1" data-meal-meta>
                      <RecipeMeta meal={meal} />
                    </div>
                    <div className="px-1">
                      <MealContext meal={meal} />
                    </div>
                    <div className="flex gap-2 px-1 pt-1 pb-1" data-meal-actions>
                      <Button className="flex-1" onClick={() => pick(meal)}>
                        <ChefHat size={16} /> Cook this
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => showRecipe(meal)}>
                        See recipe
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
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
                    ? 'Meal ideas using your ingredients, with expiry dates in mind.'
                    : 'Add ingredients or set their measured amounts to get started.')
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
      {!recipe && !loadingSaved && state.demoMealsEnabled && (busy || error || !meals.length) && (
        <SavedDemoAction
          key={String(busy)}
          waiting={busy}
          onClick={() => void generate(undefined, true)}
        />
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
        <MealConfirmation
          meal={selected}
          state={state}
          refresh={refresh}
          close={() => setConfirming(false)}
          complete={() => {
            setConfirming(false);
            setSelected(null);
            setImageMeals([]);
            toast.success('Meal recorded and inventory updated.');
            onKitchen();
          }}
        />
      )}
      {discard && (
        <Modal
          title="End this cooking session?"
          description="Your selection will be cleared. Inventory and meal history stay unchanged."
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
                  setImageMeals([]);
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
function RecipeMeta({ meal }: { meal: RankedMeal }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Clock3 size={14} />
        {meal.cookingMinutes} min estimate
      </span>
      <span className="flex items-center gap-1.5">
        <Users size={14} />
        {meal.servings} servings
      </span>
    </div>
  );
}
function RecipeDetails({ meal, cooking }: { meal: RankedMeal; cooking: boolean }) {
  const [done, setDone] = useState<number[]>([]);
  return (
    <div className="grid items-start gap-6 border-t border-border pt-6 lg:grid-cols-[minmax(200px,0.7fr)_minmax(0,1.3fr)]">
      <div className="min-w-0">
        <h3 className="mb-3 font-bold">Ingredients</h3>
        <ul>
          {meal.ingredients.map((ingredient) => (
            <li
              key={ingredient.ingredientId}
              className="flex justify-between gap-4 border-b border-border/50 py-2.5 text-sm last:border-0"
            >
              <span className="min-w-0">
                {meal.ingredientNames[ingredient.ingredientId] ?? 'Ingredient'}
                {ingredient.ingredientId.startsWith('staple-') && (
                  <span className="ml-2 text-xs text-muted-foreground">staple</span>
                )}
              </span>
              <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                {formatQuantity(ingredient.amount, ingredient.unit)}
              </span>
            </li>
          ))}
        </ul>
        <p className="helper mt-3">
          Recipe amounts are estimates. Adjust actual use after cooking.
        </p>
      </div>
      <section aria-label="Recipe steps" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold">Steps</h3>
          {cooking && (
            <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {done.length} of {meal.steps.length} complete
            </span>
          )}
        </div>
        <ol className="space-y-3">
          {meal.steps.map((step, index) => (
            <li key={index}>
              {cooking ? (
                <Choice
                  variant="step"
                  number={index + 1}
                  label={`Step ${index + 1}: ${step}`}
                  checked={done.includes(index)}
                  onCheckedChange={(checked) =>
                    setDone((current) =>
                      checked
                        ? [...current.filter((value) => value !== index), index]
                        : current.filter((value) => value !== index),
                    )
                  }
                >
                  <span
                    className={cn(done.includes(index) && 'text-muted-foreground line-through')}
                  >
                    {step}
                  </span>
                </Choice>
              ) : (
                <div className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{step}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
