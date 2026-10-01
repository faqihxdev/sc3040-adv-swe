'use client';
import { PageHeader } from './page-header';
import { PageActions } from './page-actions';
import { useState } from 'react';
import {
  Users,
  Copy,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Plus,
  X,
  Check,
  Crown,
  UserRoundMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppState } from '@/domain/model';
import { message } from '@/lib/api';
import { Button } from './ui/button';
import { Busy, Modal, ErrorText } from './common';
import type { Mutate } from './workspace';
type Decision = {
  command: 'transfer' | 'remove_member' | 'leave' | 'delete_household';
  user_id?: string;
  name?: string;
};
export function HouseholdSettings({
  state,
  mutate,
  refresh,
  refreshing,
}: {
  state: AppState;
  mutate: Mutate;
  refresh: () => Promise<unknown>;
  refreshing: boolean;
}) {
  const [exclusions, setExclusions] = useState(state.exclusions);
  const [draft, setDraft] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const h = state.household!;
  const owner = h.owner_id === state.user.id;
  const hasUnsavedExclusions =
    JSON.stringify([...exclusions].sort()) !== JSON.stringify([...state.exclusions].sort());
  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const next = draft.trim();
    if (!next || exclusions.some((x) => x.toLowerCase() === next.toLowerCase())) return;
    setExclusions([...exclusions, next]);
    setDraft('');
  }
  async function invite() {
    await act(async () => {
      const result = await mutate({ command: 'invite' });
      setCode(String(result.code));
      setExpires(String(result.expires_at));
    });
  }
  function decide(d: Decision) {
    setError('');
    setConfirmation('');
    setDecision(d);
  }
  async function confirm() {
    if (!decision) return;
    await act(async () => {
      await mutate({ ...decision, version: h.version, confirmation });
      setDecision(null);
      toast.success('Household updated.');
    });
  }
  const explanation =
    decision?.command === 'transfer'
      ? 'The selected member becomes the owner. You remain a member.'
      : decision?.command === 'remove_member'
        ? 'They will lose access to this household. Their previous activity remains.'
        : decision?.command === 'leave'
          ? 'You will lose access to this household. Your previous activity remains.'
          : 'All members, inventory, join codes and cooking history for this household will be deleted.';
  return (
    <div className="space-y-7">
      <PageHeader
        artwork="household"
        title="Household"
        action={
          <Button
            variant="ghost"
            disabled={refreshing || busy}
            onClick={() => act(refresh, 'Household refreshed.')}
            aria-label="Refresh household"
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} size={17} />
            Refresh
          </Button>
        }
      />
      <ErrorText error={decision ? '' : error} />
      <div className="grid items-start gap-10 lg:gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <section className="panel page-section">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-secondary">
                <Users size={22} />
              </span>
              <div>
                <h2 className="section-title">{h.name}</h2>
                <p className="helper">
                  {state.members.length} {state.members.length === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-1">
              {state.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-bold">
                      {m.display_name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold">
                        {m.display_name}
                        {m.id === state.user.id ? ' (you)' : ''}
                      </p>
                      <p className="helper">{m.id === h.owner_id ? 'Owner' : 'Member'}</p>
                    </div>
                  </div>
                  {owner && m.id !== state.user.id && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-12"
                        aria-label={`Make ${m.display_name} owner`}
                        title={`Make ${m.display_name} owner`}
                        onClick={() =>
                          decide({ command: 'transfer', user_id: m.id, name: m.display_name })
                        }
                      >
                        <Crown size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-12 hover:bg-[var(--danger-bg)] hover:text-destructive"
                        aria-label={`Remove ${m.display_name} from household`}
                        title={`Remove ${m.display_name} from household`}
                        onClick={() =>
                          decide({ command: 'remove_member', user_id: m.id, name: m.display_name })
                        }
                      >
                        <UserRoundMinus size={18} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {owner && (
              <div className="mt-6 border-t border-border pt-6 lg:rounded-xl lg:border-0 lg:bg-muted/60 lg:p-4">
                <h3 className="font-bold">Invite a member</h3>
                <p className="helper mt-2">
                  Valid for 7 days. A new code replaces the previous one.
                </p>
                <Button variant="outline" className="mt-4" disabled={busy} onClick={invite}>
                  <KeyRound size={16} />
                  Generate join code
                </Button>
                {code && (
                  <div className="mt-4 rounded-xl bg-secondary p-4">
                    <div className="flex items-center justify-between">
                      <code className="text-lg font-bold tracking-widest">{code}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copy join code"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(code)
                            .then(() => toast.success('Code copied.'))
                            .catch(() => toast.error('Copy the code manually.'))
                        }
                      >
                        <Copy size={16} />
                      </Button>
                    </div>
                    <p className="helper mt-2">
                      Expires {new Date(expires).toLocaleDateString('en-SG')}. Share only with
                      people you want to join.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <section className="panel page-section">
            <div className="flex items-center gap-3">
              <ShieldCheck size={24} />
              <h2 className="section-title">Dietary exclusions</h2>
            </div>
            <p className="helper mt-3">
              Apply to your meals and override preferences. Always check recipes for allergens. AI
              screening cannot guarantee allergy safety.
            </p>
            <div className="my-5 flex flex-wrap gap-2">
              {exclusions.map((s, i) => (
                <span
                  key={s}
                  className="inline-flex max-w-full items-center gap-1 rounded-[1.625rem] bg-secondary py-1 pl-3 pr-1 text-xs font-bold"
                >
                  <span className="min-w-0 wrap-anywhere">{s}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full hover:translate-none! hover:bg-background focus-visible:ring-inset active:scale-100!"
                    aria-label={'Remove ' + s}
                    onClick={() => setExclusions(exclusions.filter((_, n) => n !== i))}
                  >
                    <X size={14} />
                  </Button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
              className="flex gap-2"
            >
              <input
                aria-label="Dietary exclusion"
                className="native-select"
                maxLength={80}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Peanuts"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={exclusions.length >= 30}
                aria-label="Add exclusion"
              >
                <Plus size={17} />
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Dairy', 'Nuts', 'Vegetarian', 'Gluten'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="min-h-11 rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground disabled:opacity-50"
                  disabled={exclusions.includes(s) || exclusions.length >= 30}
                  onClick={() => setExclusions([...exclusions, s])}
                >
                  {s}
                </button>
              ))}
            </div>
            <PageActions pinned={hasUnsavedExclusions} className="mt-4">
              <Button
                disabled={busy || !hasUnsavedExclusions}
                onClick={() =>
                  act(() => mutate({ command: 'preferences', exclusions }), 'Exclusions saved.')
                }
              >
                <Busy busy={busy}>Save exclusions</Busy>
                <Check size={16} />
              </Button>
              <p className="text-xs font-medium text-muted-foreground" role="status">
                {hasUnsavedExclusions ? 'Unsaved changes' : ''}
              </p>
            </PageActions>
          </section>
        </div>
      </div>
      <section className="panel page-section">
        <h2 className="font-bold">Household access</h2>
        <p className="helper mt-2">
          {owner
            ? 'Transfer ownership before leaving. A sole owner can delete the household.'
            : 'Leaving keeps historical household activity but removes your access.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => decide({ command: 'leave' })}>
            Leave household
          </Button>
          {owner && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => decide({ command: 'delete_household' })}
            >
              Delete household
            </Button>
          )}
        </div>
      </section>
      {decision && (
        <Modal
          title={
            decision.command === 'transfer'
              ? 'Transfer ownership to ' + decision.name + '?'
              : decision.command === 'remove_member'
                ? 'Remove ' + decision.name + '?'
                : decision.command === 'leave'
                  ? 'Leave this household?'
                  : 'Delete ' + h.name + '?'
          }
          description={explanation}
          onClose={() => !busy && setDecision(null)}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button
                variant={decision.command === 'transfer' ? 'default' : 'destructive'}
                disabled={
                  busy || (decision.command === 'delete_household' && confirmation !== h.name)
                }
                onClick={confirm}
              >
                <Busy busy={busy}>
                  {decision.command === 'transfer'
                    ? 'Transfer ownership'
                    : decision.command === 'remove_member'
                      ? 'Remove member'
                      : decision.command === 'leave'
                        ? 'Leave household'
                        : 'Delete household'}
                </Busy>
              </Button>
            </>
          }
        >
          <ErrorText error={error} />
          {decision.command === 'delete_household' && (
            <label className="field">
              Type {h.name} to confirm
              <input
                className="native-select"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
        </Modal>
      )}
    </div>
  );
}
