'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Camera, Upload, ImagePlus, Trash2, Plus, ScanLine, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, ItemInput } from '@/domain/model';
import { stockLabels } from '@/domain/model';
import { batchItemsSchema, ingredientKey, PHOTO_LIMITS } from '@/domain/photo';
import { preparePhoto, recognisePhoto } from '@/lib/photo';
import { message } from '@/lib/api';
import { cn } from '@/lib/utils';
import { todaySingapore } from '@/domain/meals';
import { Modal, Busy, ErrorText } from './common';
import { Button } from './ui/button';
import { SelectField } from './ui/select-field';
import { Disclosure } from './ui/disclosure';
import type { Mutate } from './workspace';

type Draft = ItemInput & { key: string; uncertain: boolean };
type Batch = { command: 'add_items'; householdId: string; requestId: string; items: ItemInput[] };
export type PhotoImportView = ComponentProps<typeof Modal> & {
  methodDisabled: boolean;
  cancelPending: () => void;
};
function PhotoImportDialog({
  render,
  methodDisabled,
  cancelPending,
  ...props
}: PhotoImportView & { render?: (view: PhotoImportView) => ReactNode }) {
  if (render) return render({ ...props, methodDisabled, cancelPending });
  return <Modal {...props} />;
}
export function PhotoImport({
  state,
  mutate,
  close,
  render,
}: {
  state: AppState;
  mutate: Mutate;
  close: () => void;
  render?: (view: PhotoImportView) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<'photo' | 'review' | 'confirm'>('photo');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState<'prepare' | 'recognise' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const controller = useRef<AbortController | null>(null);
  const url = useRef('');
  const selection = useRef(0);
  const householdId = useRef(state.household!.id);
  const duplicateNames = new Set(state.items.map((item) => ingredientKey(item.name)));
  useEffect(
    () => () => {
      selection.current++;
      controller.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  function cancelPending() {
    controller.current?.abort();
    selection.current++;
    setBusy(null);
  }
  function dismiss() {
    if (busy === 'save') return;
    controller.current?.abort();
    selection.current++;
    setOpen(false);
  }
  async function choose(files: File[]) {
    if (busy) return;
    setError('');
    if (files.length !== 1) {
      setError('Choose one photo at a time, with up to 10 food types.');
      return;
    }
    const token = ++selection.current;
    setBusy('prepare');
    setPhoto(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = '';
    setPreviewUrl('');
    try {
      const prepared = await preparePhoto(files[0]);
      if (selection.current !== token) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(prepared);
      setPreviewUrl(url.current);
      setPhoto(prepared);
      setNotice('');
    } catch (e) {
      if (selection.current === token) setError(message(e));
    } finally {
      if (selection.current === token) setBusy(null);
    }
  }
  async function recognise() {
    if (!photo || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy('recognise');
    setError('');
    try {
      const result = await recognisePhoto(photo, abort.signal);
      if (abort.signal.aborted) return;
      setNotice(
        [
          result.message,
          result.hasMore
            ? 'More than 10 food types were detected. Add the remaining items in another photo.'
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      if (!result.items.length) {
        setError(
          result.message || 'No ingredients found. Try a clearer photo or enter them manually.',
        );
        return;
      }
      setDrafts(
        result.items.map((item) => ({
          ...item,
          key: crypto.randomUUID(),
          stock: 0,
          expiry_date: '',
          location: '',
        })),
      );
      setStep('review');
    } catch (e) {
      if (!abort.signal.aborted) setError(message(e));
    } finally {
      if (controller.current === abort) {
        setBusy(null);
        controller.current = null;
      }
    }
  }
  function update(key: string, patch: Partial<ItemInput>) {
    setDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setInvalid((errors) =>
      Object.fromEntries(
        Object.entries(errors).filter(
          ([field]) => !Object.keys(patch).some((name) => field === `${key}-${name}`),
        ),
      ),
    );
    setError('');
  }
  function review() {
    const items = drafts.map(({ name, stock, expiry_date, category, location }) => ({
      name,
      stock,
      expiry_date,
      category,
      location,
    }));
    const parsed = batchItemsSchema.safeParse(items);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const [index, field] = issue.path;
        if (typeof index === 'number' && typeof field === 'string')
          errors[`${drafts[index].key}-${field}`] =
            field === 'stock'
              ? 'Choose a stock level.'
              : field === 'expiry_date'
                ? 'Enter a valid expiry date.'
                : 'Enter an ingredient name.';
      }
      setInvalid(errors);
      setError(drafts.length ? 'Check the highlighted fields.' : 'Add at least one ingredient.');
      const first = Object.keys(errors)[0];
      if (first) form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setError('');
    setBatch({
      command: 'add_items',
      householdId: householdId.current,
      requestId: crypto.randomUUID(),
      items: parsed.data,
    });
    setAttempted(false);
    setStep('confirm');
  }
  async function save() {
    if (!batch || busy) return;
    setBusy('save');
    setAttempted(true);
    setError('');
    try {
      await mutate(batch);
      toast.success(
        `${batch.items.length} ingredient${batch.items.length === 1 ? '' : 's'} added.`,
      );
      setOpen(false);
    } catch (e) {
      setError(`${message(e)} Retry uses the same save request to prevent duplicates.`);
    } finally {
      setBusy(null);
    }
  }
  function addRow() {
    setDrafts((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        name: '',
        stock: 0,
        expiry_date: '',
        category: '',
        location: '',
        uncertain: false,
      },
    ]);
  }
  const count = drafts.length;
  return (
    <PhotoImportDialog
      render={render}
      methodDisabled={busy === 'save' || attempted}
      cancelPending={cancelPending}
      open={open}
      wide
      title={
        step === 'photo'
          ? 'Add from a photo'
          : step === 'review'
            ? 'Review ingredients'
            : 'Confirm ingredients'
      }
      description={
        step === 'photo'
          ? 'Arrange up to 10 food types clearly in one photo.'
          : step === 'review'
            ? 'Check names, then choose stock and expiry dates.'
            : 'Nothing is added until you confirm.'
      }
      onClose={() => dismiss()}
      onAfterClose={(event) => {
        event.preventDefault();
        close();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={busy === 'save'}
            onClick={
              step === 'confirm' && !attempted
                ? () => {
                    setStep('review');
                    setError('');
                  }
                : () => dismiss()
            }
          >
            {step === 'confirm' && !attempted ? 'Back' : 'Cancel'}
          </Button>
          {step === 'photo' ? (
            <Button disabled={!photo || Boolean(busy) || !state.aiEnabled} onClick={recognise}>
              <Busy busy={busy === 'recognise'}>
                {busy === 'recognise' ? 'Recognising' : 'Find ingredients'}
              </Busy>
              <ScanLine size={17} />
            </Button>
          ) : step === 'review' ? (
            <Button disabled={!count} onClick={review}>
              Review {count || ''} ingredient{count === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button disabled={Boolean(busy)} onClick={save}>
              <Busy busy={busy === 'save'}>
                {busy === 'save'
                  ? 'Saving ingredients'
                  : attempted
                    ? 'Retry save'
                    : `Confirm ${batch?.items.length} ingredient${batch?.items.length === 1 ? '' : 's'}`}
              </Busy>
              <Check size={17} />
            </Button>
          )}
        </>
      }
    >
      <ErrorText error={error} />
      {step === 'photo' ? (
        <>
          <input
            ref={uploadInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload ingredient photo"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void choose(files);
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-label="Take ingredient photo"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void choose(files);
            }}
          />
          <div
            data-photo-dropzone
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void choose(Array.from(event.dataTransfer.files));
            }}
          >
            <button
              type="button"
              aria-label={previewUrl ? 'Change ingredient photo' : 'Choose ingredient photo'}
              disabled={Boolean(busy)}
              onClick={() => uploadInput.current?.click()}
              className={cn(
                'relative grid min-h-48 w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60',
                previewUrl && 'border-solid',
                dragging && 'border-primary bg-primary/5',
              )}
            >
              {previewUrl ? (
                <>
                  {/* Object URLs contain the processed local photo, not a remote asset. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Selected ingredient photo"
                    className="max-h-64 w-full object-contain sm:max-h-72"
                  />
                  <span className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm font-semibold backdrop-blur-sm">
                    <Upload size={16} aria-hidden="true" />
                    Change photo
                  </span>
                </>
              ) : (
                <span className="block space-y-2 p-6 text-center">
                  <ImagePlus
                    className="mx-auto text-muted-foreground"
                    size={32}
                    aria-hidden="true"
                  />
                  <span className="block text-sm font-semibold">Choose photo</span>
                  <span className="helper hidden sm:block">Or drag it here</span>
                </span>
              )}
            </button>
          </div>
          <Button
            variant="secondary"
            className="w-full sm:hidden"
            disabled={Boolean(busy)}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera size={18} />
            Take photo
          </Button>
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Busy busy>
                {busy === 'prepare'
                  ? 'Preparing photo'
                  : 'Identifying ingredients. You can cancel.'}
              </Busy>
            </p>
          )}
          {!state.aiEnabled && (
            <p className="helper">
              Photo recognition is switched off. You can still add ingredients manually.
            </p>
          )}
          <p className="helper">
            JPEG, PNG or WebP, up to 12 MB. Sent to OpenAI for recognition; not stored by this app.
          </p>
        </>
      ) : step === 'review' ? (
        <>
          {notice && (
            <p className="helper" role="status">
              {notice}
            </p>
          )}
          <form
            ref={form}
            onSubmit={(event) => {
              event.preventDefault();
              review();
            }}
            className="space-y-3"
            noValidate
          >
            {drafts.map((draft, index) => (
              <article
                key={draft.key}
                className="space-y-3 rounded-[1.25rem] border border-border p-3 sm:rounded-3xl sm:p-4"
              >
                <div className="flex items-end gap-2">
                  <label className="field min-w-0 flex-1">
                    Ingredient {index + 1}
                    <input
                      className={cn(
                        'native-select',
                        invalid[`${draft.key}-name`] && 'ring-2 ring-destructive',
                      )}
                      data-field={`${draft.key}-name`}
                      aria-invalid={Boolean(invalid[`${draft.key}-name`])}
                      maxLength={100}
                      value={draft.name}
                      onChange={(event) => update(draft.key, { name: event.target.value })}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${draft.name || `ingredient ${index + 1}`} draft`}
                    onClick={() => {
                      setDrafts((rows) => rows.filter((row) => row.key !== draft.key));
                      setError('');
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
                {invalid[`${draft.key}-name`] && (
                  <p className="text-xs text-destructive">Enter an ingredient name.</p>
                )}
                {draft.uncertain && (
                  <p className="text-xs font-medium text-accent-foreground">
                    Check the suggested name.
                  </p>
                )}
                {duplicateNames.has(ingredientKey(draft.name)) && (
                  <p className="helper">Already in inventory. Confirming adds a separate entry.</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="field min-w-0">
                    Stock level
                    <div
                      data-field={`${draft.key}-stock`}
                      tabIndex={-1}
                      className={cn(
                        'rounded-lg',
                        invalid[`${draft.key}-stock`] && 'ring-2 ring-destructive',
                      )}
                      aria-invalid={Boolean(invalid[`${draft.key}-stock`])}
                    >
                      <SelectField
                        label={`Stock level for ingredient ${index + 1}`}
                        value={String(draft.stock)}
                        onValueChange={(value) => update(draft.key, { stock: Number(value) })}
                        options={[
                          { value: '0', label: 'Choose stock' },
                          ...stockLabels
                            .slice(1)
                            .map((label, i) => ({ value: String(i + 1), label })),
                        ]}
                      />
                    </div>
                    {invalid[`${draft.key}-stock`] && (
                      <p className="text-xs text-destructive">Choose a stock level.</p>
                    )}
                  </div>
                  <label className="field min-w-0">
                    Expiry date
                    <input
                      className={cn(
                        'native-select min-w-0',
                        invalid[`${draft.key}-expiry_date`] && 'ring-2 ring-destructive',
                      )}
                      data-field={`${draft.key}-expiry_date`}
                      aria-invalid={Boolean(invalid[`${draft.key}-expiry_date`])}
                      type="date"
                      value={draft.expiry_date}
                      onChange={(event) => update(draft.key, { expiry_date: event.target.value })}
                    />
                    {invalid[`${draft.key}-expiry_date`] && (
                      <p className="text-xs text-destructive">Enter a valid date.</p>
                    )}
                  </label>
                </div>
                <Disclosure title="Category & storage" className="!bg-transparent">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="field">
                      Category
                      <input
                        className="native-select"
                        maxLength={50}
                        value={draft.category}
                        onChange={(event) => update(draft.key, { category: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      Storage
                      <input
                        className="native-select"
                        maxLength={50}
                        list="photo-storage"
                        placeholder="e.g. Fridge"
                        value={draft.location}
                        onChange={(event) => update(draft.key, { location: event.target.value })}
                      />
                    </label>
                  </div>
                </Disclosure>
              </article>
            ))}
            <datalist id="photo-storage">
              {state.household?.locations.map((location) => (
                <option key={location}>{location}</option>
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              disabled={count >= PHOTO_LIMITS.items}
              onClick={addRow}
            >
              <Plus size={17} />
              Add missing ingredient
            </Button>
          </form>
          <p className="helper">
            Check the actual food and labels. Photos cannot establish freshness or food safety.
          </p>
        </>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {batch?.items.map((item, index) => (
              <li key={index} className="py-3">
                <p className="font-semibold text-sm">{item.name}</p>
                <p className="helper mt-1">
                  {stockLabels[item.stock]} stock · {item.expiry_date}
                  {item.location ? ` · ${item.location}` : ''}
                </p>
                {item.expiry_date < todaySingapore() && (
                  <p className="mt-1 text-xs text-destructive">
                    Past-date item: excluded from meal suggestions.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="helper">
            All entries are saved together. Your latest batch can be undone from Activity if none of
            its ingredients have changed.
          </p>
        </>
      )}
    </PhotoImportDialog>
  );
}
