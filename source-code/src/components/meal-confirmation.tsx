'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import type { AppState, Change, Item, RankedMeal } from '@/domain/model';
import { discardReasons, formatQuantity, remainingQuantity } from '@/domain/quantities';
import { validateChanges } from '@/domain/meals';
import { api, ApiError, message } from '@/lib/api';
import { Button } from './ui/button';
import { Busy, ErrorText, Modal } from './common';
import { QuantityField } from './quantity-field';
import { SelectField } from './ui/select-field';
import { cn } from '@/lib/utils';

type MealConfirmationProps = {
  meal: RankedMeal;
  state: AppState;
  refresh: () => Promise<AppState>;
  close: () => void;
  complete: () => void;
};

type DraftChange = Omit<Change, 'usedAmount' | 'discardedAmount'> & {
  usedAmount: number | null;
  discardedAmount: number | null;
};

function initialChanges(meal: RankedMeal, items: Item[]): DraftChange[] {
  return items.map((item) => ({
    id: item.id,
    version: item.version,
    usedAmount:
      meal.ingredients.find((ingredient) => ingredient.ingredientId === item.id)?.amount ?? 0,
    discardedAmount: 0,
    discardReason: null,
  }));
}

function reasonLabel(reason: string) {
  return reason.replace('_', ' ');
}

export function MealConfirmation({ meal, state, refresh, close, complete }: MealConfirmationProps) {
  const initialItems = useMemo(
    () =>
      meal.trackedItems.map(
        (item) => state.items.find((current) => current.id === item.id) ?? item,
      ),
    [meal, state.items],
  );
  const [items, setItems] = useState<Item[]>(initialItems);
  const [changes, setChanges] = useState<DraftChange[]>(() => initialChanges(meal, initialItems));
  const [openWasteIds, setOpenWasteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const inFlight = useRef(false);

  function update(id: string, patch: Partial<DraftChange>) {
    setChanges((current) =>
      current.map((change) => (change.id === id ? { ...change, ...patch } : change)),
    );
  }

  function validationMessage(change: DraftChange, item: Item) {
    if (change.usedAmount === null) return 'Enter a used amount of 0 or more.';
    if (change.discardedAmount === null) return 'Enter a waste amount of 0 or more.';
    if (!Number.isFinite(change.usedAmount) || change.usedAmount < 0)
      return 'Enter a used amount of 0 or more.';
    if (!Number.isFinite(change.discardedAmount) || change.discardedAmount < 0)
      return 'Enter a waste amount of 0 or more.';
    if (item.quantity === null || item.unit === null) return 'Set this item amount before cooking.';
    if (change.usedAmount + change.discardedAmount > item.quantity)
      return 'Used and waste cannot exceed the available amount.';
    if (change.discardedAmount > 0 && !change.discardReason) return 'Choose a waste reason.';
    return '';
  }

  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const latest = await refresh();
      const current = meal.trackedItems.map((tracked) =>
        latest.items.find((item) => item.id === tracked.id),
      );
      if (current.some((item) => !item))
        throw new Error(
          'A recipe ingredient was removed. Close this meal and request fresh suggestions.',
        );
      const available = current.filter((item): item is Item => !!item);
      setItems(available);
      setChanges(initialChanges(meal, available));
      setOpenWasteIds([]);
      setConflict(false);
      setError('');
      setRefreshFailed(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function retryRefresh() {
    if (inFlight.current || !saved) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await refresh();
      setRefreshFailed(false);
      complete();
    } catch (cause) {
      setRefreshFailed(true);
      setError(`Meal saved, but the latest stock could not be loaded. ${message(cause)}`);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function save() {
    if (inFlight.current || saved) return;
    const invalid = changes
      .map((change) => {
        const item = items.find((current) => current.id === change.id);
        return item ? validationMessage(change, item) : 'An ingredient is no longer available.';
      })
      .find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const normalized = changes.map((change): Change => ({
      ...change,
      usedAmount: change.usedAmount ?? Number.NaN,
      discardedAmount: change.discardedAmount ?? Number.NaN,
    }));
    try {
      validateChanges(normalized, items);
    } catch (cause) {
      setError(message(cause));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api('confirm', { token: meal.token, changes: normalized });
      setSaved(true);
      try {
        await refresh();
        complete();
      } catch (cause) {
        setRefreshFailed(true);
        setError(`Meal saved, but the latest stock could not be loaded. ${message(cause)}`);
      }
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <Modal
      title="Record meal"
      description="Adjust what you used and record any waste. Changes save together."
      onClose={() => !busy && (saved ? complete() : close())}
      wide
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={saved ? complete : close}>
            {saved ? 'Done' : 'Cancel'}
          </Button>
          {conflict ? (
            <Button variant="outline" disabled={busy} onClick={reload}>
              <RefreshCw size={16} />
              Load latest stock
            </Button>
          ) : saved ? (
            refreshFailed ? (
              <Button variant="outline" disabled={busy} onClick={retryRefresh}>
                <RefreshCw size={16} />
                Retry refresh
              </Button>
            ) : (
              <p className="text-sm font-semibold text-foreground" role="status">
                Meal saved.
              </p>
            )
          ) : (
            <Button disabled={busy} onClick={save}>
              <Busy busy={busy}>Confirm meal</Busy>
              {!busy && <Check size={16} />}
            </Button>
          )}
        </>
      }
    >
      <ErrorText error={error} />
      {conflict ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          This meal used an older stock version. Load the latest stock before confirming.
        </p>
      ) : (
        <div className="space-y-3">
          {changes.map((change) => {
            const item = items.find((current) => current.id === change.id);
            if (!item) return null;
            const remaining =
              item.quantity !== null &&
              change.usedAmount !== null &&
              change.discardedAmount !== null
                ? remainingQuantity(item.quantity, change.usedAmount, change.discardedAmount)
                : null;
            const fieldError = validationMessage(change, item);
            const showWaste = openWasteIds.includes(item.id);
            const wasteDetailsId = `waste-details-${item.id}`;
            return (
              <section
                key={change.id}
                aria-labelledby={`meal-amounts-${item.id}`}
                className="rounded-xl border border-border bg-muted/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`meal-amounts-${item.id}`} className="font-bold">
                      {item.name}
                    </h3>
                    <p className="helper mt-1">
                      Available {formatQuantity(item.quantity ?? null, item.unit ?? null)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 text-right text-sm font-semibold tabular-nums',
                      remaining !== null && remaining < 0 && 'text-destructive',
                    )}
                  >
                    Left {formatQuantity(remaining, item.unit ?? null)}
                  </p>
                </div>
                <fieldset disabled={saved || busy} className="mt-4 min-w-0">
                  <QuantityField
                    amount={change.usedAmount}
                    unit={item.unit ?? null}
                    onAmountChange={(amount) => update(item.id, { usedAmount: amount })}
                    onUnitChange={() => undefined}
                    label={`Used amount for ${item.name}`}
                    required={false}
                    unitLocked
                  />
                </fieldset>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 w-full justify-between"
                  aria-label={`Waste details for ${item.name}`}
                  aria-expanded={showWaste}
                  aria-controls={wasteDetailsId}
                  disabled={saved || busy}
                  onClick={() =>
                    setOpenWasteIds((current) =>
                      current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                >
                  <span>
                    {showWaste
                      ? 'Hide waste'
                      : change.discardedAmount !== null && change.discardedAmount > 0
                        ? `Waste: ${formatQuantity(change.discardedAmount, item.unit ?? null)}`
                        : 'Add waste'}
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'transition-transform motion-reduce:transition-none',
                      showWaste && 'rotate-180',
                    )}
                  />
                </Button>
                {showWaste && (
                  <fieldset
                    id={wasteDetailsId}
                    disabled={saved || busy}
                    className="mt-3 min-w-0 space-y-3 border-t border-border/70 pt-3"
                  >
                    <QuantityField
                      amount={change.discardedAmount}
                      unit={item.unit ?? null}
                      onAmountChange={(amount) =>
                        update(item.id, {
                          discardedAmount: amount,
                          discardReason:
                            amount !== null && amount > 0 ? change.discardReason : null,
                        })
                      }
                      onUnitChange={() => undefined}
                      label={`Waste amount for ${item.name} (optional)`}
                      required={false}
                      unitLocked
                    />
                    {change.discardedAmount !== null && change.discardedAmount > 0 && (
                      <div className="field">
                        <span>Waste reason</span>
                        <SelectField
                          label={`Waste reason for ${item.name}`}
                          value={change.discardReason ?? ''}
                          onValueChange={(value) =>
                            update(item.id, {
                              discardReason: (value || null) as Change['discardReason'],
                            })
                          }
                          options={[
                            { value: '', label: 'Choose a reason' },
                            ...discardReasons.map((reason) => ({
                              value: reason,
                              label: reasonLabel(reason),
                            })),
                          ]}
                        />
                      </div>
                    )}
                  </fieldset>
                )}
                {fieldError && <p className="mt-3 text-sm text-destructive">{fieldError}</p>}
              </section>
            );
          })}
        </div>
      )}
      <p className="helper">Recipe amounts start as estimates. You can record zero actual use.</p>
    </Modal>
  );
}
