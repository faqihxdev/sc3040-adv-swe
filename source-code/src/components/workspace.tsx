'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Boxes,
  Utensils,
  ChartNoAxesCombined,
  Users,
  UserRound,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
} from 'lucide-react';
import type { AppState } from '@/domain/model';
import { api, message, ApiError } from '@/lib/api';
import { browserDb } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Brand, Busy, ErrorText } from './common';
import { ThemeControl } from './theme-control';
import { Inventory } from './inventory';
import { Meals } from './meals';
import { AnalyticsSkeleton } from './loading-skeletons';
import { HouseholdSettings } from './household';
import { Account } from './account';
import { SlidingSelection } from './sliding-selection';
import { useSharedUpdates } from './use-shared-updates';
import type { InventoryHighlights } from '@/domain/shared-updates';
const Analytics = dynamic(() => import('./analytics').then((module) => module.Analytics), {
  loading: AnalyticsSkeleton,
});
const tabs = [
  { id: 'inventory', label: 'Inventory', Icon: Boxes },
  { id: 'meals', label: 'Cook', Icon: Utensils },
  { id: 'analytics', label: 'Insights', Icon: ChartNoAxesCombined },
  { id: 'household', label: 'Household', Icon: Users },
  { id: 'account', label: 'Account', Icon: UserRound },
] as const;
type Tab = (typeof tabs)[number]['id'];
export type Mutate = (input: unknown) => Promise<Record<string, unknown>>;
export function Workspace({ initialState }: { initialState: AppState }) {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const requestedTab = params.get('view');
  const tab = tabs.find((t) => t.id === requestedTab)?.id ?? 'inventory';
  function setTab(value: Tab) {
    // These views share one client workspace; switching them needs no server render.
    const url = new URL(window.location.href);
    url.searchParams.set('view', value);
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const [error, setError] = useState('');
  const stateKey = ['household-state', initialState.user.id];
  const {
    data: state = initialState,
    isFetching,
    error: queryError,
  } = useQuery({
    queryKey: stateKey,
    queryFn: ({ signal }) => api<AppState>('state', undefined, signal),
    initialData: initialState,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
  });
  const highlights = useSharedUpdates(state);
  const [seenResetId, setSeenResetId] = useState(0);
  // Keep the reset key when that activity ages out of the bounded activity list.
  const resetId = Math.max(
    seenResetId,
    state.activity.find((entry) => entry.action === 'demo_reset')?.id ?? 0,
  );
  if (resetId !== seenResetId) setSeenResetId(resetId);
  async function refresh() {
    await client.cancelQueries({ queryKey: stateKey });
    return client.fetchQuery({
      queryKey: stateKey,
      queryFn: ({ signal }) => api<AppState>('state', undefined, signal),
      staleTime: 0,
    });
  }
  async function resetDemo() {
    await client.cancelQueries({ queryKey: stateKey });
    const data = await api<AppState>('demo/reset', {
      householdId: state.household!.id,
      version: state.household!.version,
      confirmation: 'RESET',
    });
    client.setQueryData(stateKey, data);
  }
  async function mutate(input: unknown) {
    const r = await api<Record<string, unknown>>('actions', input);
    try {
      await refresh();
    } catch {
      setError(
        'Your change was saved, but the view could not refresh. Open Household and select Refresh.',
      );
      void client.invalidateQueries({ queryKey: stateKey });
    }
    return r;
  }
  async function logout() {
    setError('');
    try {
      const { error } = await browserDb().auth.signOut({ scope: 'local' });
      if (error) throw error;
      client.clear();
      router.replace('/');
      router.refresh();
    } catch (e) {
      setError(message(e));
    }
  }
  if (queryError instanceof ApiError && queryError.status === 401)
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="section-title">Your session has ended</h1>
        <p className="my-4 text-sm text-muted-foreground">
          Sign in again to access your household.
        </p>
        <Button
          onClick={() => {
            client.clear();
            router.replace('/login');
            router.refresh();
          }}
        >
          Sign in
        </Button>
      </main>
    );
  if (!state.household) {
    if (tab === 'account')
      return (
        <main className="mx-auto max-w-3xl space-y-6 px-2 py-6 sm:px-6">
          <Button variant="ghost" onClick={() => setTab('inventory')}>
            <ArrowLeft size={17} /> Your household
          </Button>
          <ErrorText error={error || (queryError ? message(queryError) : '')} />
          <Account state={state} logout={logout} resetDemo={resetDemo} />
        </main>
      );
    return (
      <Onboarding
        state={state}
        mutate={mutate}
        logout={logout}
        onAccount={() => setTab('account')}
      />
    );
  }
  const nav = (mobile = false) => (
    <nav
      className={mobile ? undefined : 'mt-10'}
      aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
    >
      <SlidingSelection
        activeKey={tab}
        className={mobile ? 'grid auto-cols-fr grid-flow-col gap-1' : 'grid gap-2'}
      >
        {tabs
          .filter(({ id }) => mobile || id !== 'account')
          .map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'relative flex min-h-12 items-center gap-3 rounded-lg font-semibold transition-colors',
                mobile
                  ? 'min-w-0 flex-col justify-center gap-1 whitespace-nowrap py-2 text-[11px]'
                  : 'px-4 py-3 text-sm',
                tab === id
                  ? 'text-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon
                size={mobile ? 20 : 19}
                className={cn('transition-colors', tab === id && 'text-primary')}
              />
              {label}
            </button>
          ))}
      </SlidingSelection>
    </nav>
  );
  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-4"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-card px-5 py-8 lg:flex">
        <Brand />
        {nav()}
        <div className="mt-auto pt-8">
          <button
            onClick={() => setTab('account')}
            aria-label={'Account for ' + state.user.display_name}
            aria-current={tab === 'account' ? 'page' : undefined}
            className={cn(
              'flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary',
              tab === 'account' && 'bg-secondary',
            )}
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-bold transition-colors',
                tab === 'account' && 'text-primary',
              )}
              aria-hidden="true"
            >
              {state.user.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold">
                {state.user.display_name}
              </span>
              <span className="block text-xs text-muted-foreground">Account</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        </div>
      </aside>
      <main
        id="content"
        className="mx-auto max-w-3xl space-y-6 px-2 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28 sm:px-6 sm:pt-8 lg:max-w-7xl lg:px-8 lg:pb-12"
      >
        <ErrorText error={error || (queryError ? message(queryError) : '')} />
        <HouseholdViews
          key={`${state.household.id}:${resetId}`}
          state={state}
          highlights={highlights}
          tab={tab}
          setTab={setTab}
          mutate={mutate}
          refresh={refresh}
          refreshing={isFetching}
          logout={logout}
          resetDemo={resetDemo}
        />
      </main>
      <div
        data-mobile-nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {nav(true)}
      </div>
    </div>
  );
}

function HouseholdViews({
  state,
  highlights,
  tab,
  setTab,
  mutate,
  refresh,
  refreshing,
  logout,
  resetDemo,
}: {
  state: AppState;
  highlights: InventoryHighlights;
  tab: Tab;
  setTab: (tab: Tab) => void;
  mutate: Mutate;
  refresh: () => Promise<AppState>;
  refreshing: boolean;
  logout: () => void;
  resetDemo: () => Promise<void>;
}) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [preferredIngredientId, setPreferredIngredientId] = useState<string | null>(null);
  return (
    <div>
      <div className="view-panel" hidden={tab !== 'inventory'}>
        <Inventory
          state={state}
          highlights={highlights}
          mutate={mutate}
          focusedItemId={focusedItemId}
          onFocusHandled={() => setFocusedItemId(null)}
        />
      </div>
      <div className="view-panel" hidden={tab !== 'meals'}>
        <Meals
          state={state}
          refresh={refresh}
          onKitchen={() => setTab('inventory')}
          active={tab === 'meals'}
          preferencesOpen={preferencesOpen}
          onPreferencesOpenChange={(open) => {
            setPreferencesOpen(open);
            if (!open) setPreferredIngredientId(null);
          }}
          onShowResults={() => setTab('meals')}
          preferredIngredientId={preferredIngredientId}
        />
      </div>
      {tab === 'analytics' && (
        <div className="view-panel">
          <Analytics
            state={state}
            onCook={(itemId) => {
              setFocusedItemId(null);
              setPreferredIngredientId(itemId);
              setTab('meals');
              setPreferencesOpen(true);
            }}
            onInventory={(itemId) => {
              setFocusedItemId(itemId);
              setTab('inventory');
            }}
          />
        </div>
      )}
      <div className="view-panel" hidden={tab !== 'household'}>
        <HouseholdSettings
          state={state}
          mutate={mutate}
          refresh={refresh}
          refreshing={refreshing}
        />
      </div>
      <div className="view-panel" hidden={tab !== 'account'}>
        <Account state={state} logout={logout} resetDemo={resetDemo} />
      </div>
    </div>
  );
}
function Onboarding({
  state,
  mutate,
  logout,
  onAccount,
}: {
  state: AppState;
  mutate: Mutate;
  logout: () => void;
  onAccount: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mutate(
        mode === 'create'
          ? { command: 'create_household', name: value }
          : { command: 'join_household', code: value },
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-dvh p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <ThemeControl />
      </header>
      <main className="mx-auto max-w-xl py-16">
        <p className="eyebrow">Hi, {state.user.display_name}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight">Your household</h1>
        <p className="my-6 text-muted-foreground">
          Create a household or join one with an invite code.
        </p>
        <div className="panel page-section">
          <div className="mb-6 grid grid-cols-2 gap-2">
            <Button
              variant={mode === 'create' ? 'default' : 'secondary'}
              onClick={() => {
                setMode('create');
                setValue('');
              }}
            >
              Create
            </Button>
            <Button
              variant={mode === 'join' ? 'default' : 'secondary'}
              onClick={() => {
                setMode('join');
                setValue('');
              }}
            >
              Join
            </Button>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="field">
              {mode === 'create' ? 'Household name' : '12-character join code'}
              <input
                className="native-select"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={mode === 'create' ? 80 : 12}
                placeholder={mode === 'create' ? 'The good food club' : 'ABCDEF123456'}
              />
            </label>
            <ErrorText error={error} />
            <Button disabled={busy}>
              <Busy busy={busy}>{mode === 'create' ? 'Start my kitchen' : 'Join kitchen'}</Busy>
              <ArrowUpRight size={17} />
            </Button>
          </form>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={onAccount}>
            <UserRound size={17} /> Account
          </Button>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </main>
    </div>
  );
}
