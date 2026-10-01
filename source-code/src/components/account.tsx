'use client';
import { PageHeader } from './page-header';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { AppState } from '@/domain/model';
import { api, message } from '@/lib/api';
import { Button } from './ui/button';
import { Busy, ErrorText, Modal } from './common';
import { ThemeControl } from './theme-control';

export function Account({
  state,
  logout,
  resetDemo,
}: {
  state: AppState;
  logout: () => void;
  resetDemo: () => Promise<void>;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  async function reset() {
    setResetBusy(true);
    setResetError('');
    try {
      await resetDemo();
      toast.success('Demo ingredients and history restored.');
    } catch (error) {
      setResetError(message(error));
      setResetBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError('');
    try {
      await api('actions', { command: 'delete_account', confirmation });
      client.clear();
      router.replace('/login');
      router.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 lg:mx-0">
      <PageHeader title="Account" artwork="account" />
      <div className="panel page-section space-y-6">
        <section className="flex items-center gap-4">
          <h2 className="sr-only">Profile</h2>
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-4">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-lg font-bold"
              aria-hidden="true"
            >
              {state.user.display_name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold">{state.user.display_name}</p>
              <p className="break-all text-sm text-muted-foreground">{state.user.email}</p>
            </div>
          </div>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <h2 className="text-base font-bold">Appearance</h2>
          <ThemeControl />
        </section>
        {state.demoResetEnabled && (
          <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <div className="min-w-0 flex-1 basis-48">
              <h2 className="text-base font-bold">Demo data</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Restore sample ingredients and meal history.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setResetError('');
                setResetting(true);
              }}
            >
              <RotateCcw size={17} /> Reset to seed
            </Button>
          </section>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-4 lg:flex-row lg:justify-end">
          <Button variant="ghost" className="h-12 justify-start gap-3 lg:h-11" onClick={logout}>
            <LogOut size={18} /> Sign out
          </Button>
          <Button
            variant="ghost"
            className="h-12 justify-start gap-3 text-destructive hover:bg-[var(--danger-bg)] hover:text-destructive lg:h-11"
            onClick={() => {
              setConfirmation('');
              setError('');
              setDeleting(true);
            }}
          >
            <Trash2 size={18} />
            Delete my account
          </Button>
        </div>
      </div>
      {resetting && (
        <Modal
          title="Reset demo data?"
          description="Replace this household’s inventory, activity and meal history with the sample data. This cannot be undone."
          onClose={() => !resetBusy && setResetting(false)}
          footer={
            <>
              <Button variant="ghost" disabled={resetBusy} onClick={() => setResetting(false)}>
                Cancel
              </Button>
              <Button disabled={resetBusy} onClick={reset}>
                <Busy busy={resetBusy}>Reset to seed</Busy>
              </Button>
            </>
          }
        >
          <ErrorText error={resetError} />
          <p className="text-sm text-muted-foreground">
            Accounts, members, preferences and AI usage are kept. Cooking sessions on this device
            will be cleared.
          </p>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Delete your account?"
          description="Your login and membership will be removed. Retained household history is de-identified. Owners must transfer ownership or delete their household first."
          onClose={() => !busy && setDeleting(false)}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy || confirmation !== 'DELETE'}
                onClick={deleteAccount}
              >
                <Busy busy={busy}>Delete account</Busy>
              </Button>
            </>
          }
        >
          <ErrorText error={error} />
          <label className="field">
            Type DELETE to confirm
            <input
              className="native-select"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
