'use client';

import { useId, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AppState, MealRequest } from '@/domain/model';
import { eligibleItems, todaySingapore, matchesExclusion } from '@/domain/meals';
import { commonStaples } from '@/domain/staples';
import { Modal } from './common';
import { Button } from './ui/button';
import { SelectField } from './ui/select-field';
import { Textarea } from './ui/textarea';
import { Choice } from './ui/choice';
import { Disclosure } from './ui/disclosure';

export function MealPreferences({
  open,
  state,
  request,
  onRequestChange,
  staples,
  onStaplesChange,
  onClose,
  onAfterClose,
  onSubmit,
}: {
  open: boolean;
  state: AppState;
  request: MealRequest;
  onRequestChange: (request: MealRequest) => void;
  staples: string;
  onStaplesChange: (value: string) => void;
  onClose: () => void;
  onAfterClose: (event: Event) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const formId = useId();
  const available = eligibleItems(state.items, state.exclusions, [], todaySingapore());
  const included = available.filter((item) => !request.excludedIds.includes(item.id));
  return (
    <Modal
      open={open}
      title="Find meals"
      description="Choose what you'd like to cook."
      onClose={onClose}
      onAfterClose={onAfterClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            className="flex-1 sm:flex-none"
            disabled={!included.length || !state.aiEnabled}
          >
            Next <ArrowRight size={17} />
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <label className="field">
            Meal
            <SelectField
              label="Meal"
              value={request.mealType}
              onValueChange={(value) =>
                onRequestChange({ ...request, mealType: value as MealRequest['mealType'] })
              }
              options={['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </label>
          <label className="field">
            People
            <SelectField
              label="People"
              value={String(request.servings)}
              onValueChange={(value) => onRequestChange({ ...request, servings: Number(value) })}
              options={[1, 2, 3, 4].map((n) => ({
                value: String(n),
                label: `${n} ${n === 1 ? 'person' : 'people'}`,
              }))}
            />
          </label>
        </div>
        <label className="field sm:col-span-2">
          Preferences (optional)
          <Textarea
            maxLength={500}
            value={request.preferences}
            onChange={(event) => onRequestChange({ ...request, preferences: event.target.value })}
            placeholder="Something warm, a little spicy…"
          />
        </label>
        <fieldset className="min-w-0 space-y-3 sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold">Available staples</legend>
          <div className="flex flex-wrap gap-2">
            {commonStaples.map((name) => {
              const excluded = matchesExclusion(name, state.exclusions);
              return (
                <Choice
                  key={name}
                  variant="pill"
                  checked={!excluded && request.staples.includes(name)}
                  disabled={excluded}
                  onCheckedChange={(checked) =>
                    onRequestChange({
                      ...request,
                      staples: checked
                        ? [...request.staples, name]
                        : request.staples.filter((staple) => staple !== name),
                    })
                  }
                >
                  {name}
                </Choice>
              );
            })}
          </div>
          <p className="helper">Keep only what you have. Next confirms availability.</p>
          {commonStaples.some((name) => matchesExclusion(name, state.exclusions)) && (
            <p className="helper">Your saved exclusions disable matching staples.</p>
          )}
          <label className="field">
            Other staples (optional)
            <input
              className="native-select"
              value={staples}
              onChange={(event) => onStaplesChange(event.target.value)}
              maxLength={1000}
              placeholder="e.g. Pepper, soy sauce"
            />
            <span className="helper font-normal">Separate with commas.</span>
          </label>
        </fieldset>
        <div className="sm:col-span-2">
          <p className="text-sm font-semibold">Saved exclusions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.exclusions.length ? state.exclusions.join(', ') : 'None saved'}
          </p>
          {!!state.exclusions.length && (
            <p className="helper mt-1">These take priority over your preferences.</p>
          )}
        </div>
        <Disclosure
          title={`Ingredients (${included.length})`}
          className="sm:col-span-2"
          contentClassName="!px-0 !pt-1 !pb-0"
        >
          <div className="space-y-2 p-1">
            {available.map((item) => (
              <Choice
                key={item.id}
                className="rounded-[var(--radius-lg)]"
                checked={!request.excludedIds.includes(item.id)}
                onCheckedChange={(checked) =>
                  onRequestChange({
                    ...request,
                    excludedIds: checked
                      ? request.excludedIds.filter((id) => id !== item.id)
                      : [...request.excludedIds, item.id],
                  })
                }
              >
                {item.name}
              </Choice>
            ))}
          </div>
        </Disclosure>
        {!included.length && (
          <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
            {available.length
              ? 'Select at least one ingredient.'
              : 'Add stocked ingredients with current expiry dates that meet your exclusions.'}
          </p>
        )}
        {!state.aiEnabled && (
          <p className="helper sm:col-span-2">AI suggestions are off in this development build.</p>
        )}
        <p className="helper sm:col-span-2">
          Check actual quantities, ingredients and food safety before cooking.
        </p>
      </form>
    </Modal>
  );
}
