'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { browserDb } from '@/lib/supabase/browser';
import { message } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Busy, ErrorText } from './common';
import { AuthLayout } from './auth-layout';
export function AuthForm({
  reset = false,
  demoOnly = false,
}: {
  reset?: boolean;
  demoOnly?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const db = browserDb();
      if (reset) {
        const {
          data: { user },
        } = await db.auth.getUser();
        if (!user) throw new Error('Open the recovery link from your email first.');
        const r = await db.auth.updateUser({ password });
        if (r.error) throw r.error;
        router.replace('/');
        router.refresh();
      } else if (mode === 'login') {
        const r = await db.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        router.replace('/');
        router.refresh();
      } else if (mode === 'signup') {
        const r = await db.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: location.origin + '/auth/callback',
          },
        });
        if (r.error) throw r.error;
        if (r.data.session) {
          router.replace('/');
          router.refresh();
        } else setNotice('Check your email to confirm your account.');
      } else {
        const r = await db.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + '/auth/callback?next=/reset-password',
        });
        if (r.error) throw r.error;
        setNotice('If this account exists, check your email for a recovery link.');
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout reset={reset}>
      <h1 id="auth-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
        {reset
          ? 'Choose a new password'
          : mode === 'signup'
            ? 'Create account'
            : mode === 'forgot'
              ? 'Forgot your password?'
              : 'Sign in'}
      </h1>
      {(reset || mode !== 'login') && (
        <p className="helper mt-3">
          {reset
            ? 'Use at least 8 characters.'
            : mode === 'signup'
              ? 'Then create or join your household.'
              : 'Enter your email for a recovery link.'}
        </p>
      )}
      <form onSubmit={submit} className="mt-7 space-y-5" aria-busy={busy}>
        {mode === 'signup' && !reset && (
          <label className="field">
            Your name
            <input
              className="native-select"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoComplete="name"
            />
          </label>
        )}
        {!reset && (
          <label className="field">
            Email
            <input
              className="native-select"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        )}
        {(mode !== 'forgot' || reset) && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="relative">
              <input
                id="password"
                className="native-select !pr-12"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' || reset ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' || reset ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={mode === 'signup' ? 'password-hint' : undefined}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 right-0"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
            {mode === 'signup' && (
              <p id="password-hint" className="helper font-normal">
                At least 8 characters.
              </p>
            )}
          </div>
        )}
        <ErrorText error={error} />
        {notice && (
          <p className="rounded-xl bg-secondary p-4 text-sm" role="status">
            {notice}
          </p>
        )}
        <Button className="w-full" size="lg" disabled={busy}>
          <Busy busy={busy}>
            {reset
              ? 'Update password'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send recovery link'
                  : 'Sign in'}
          </Busy>
        </Button>
      </form>
      {!reset && !demoOnly && (
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setShowPassword(false);
              setError('');
              setNotice('');
            }}
          >
            {mode === 'signup' ? 'Back to sign in' : 'Create account'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'forgot' ? 'login' : 'forgot');
              setShowPassword(false);
              setError('');
              setNotice('');
            }}
          >
            {mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}
          </Button>
        </div>
      )}
      {demoOnly && (
        <p className="mt-5 text-xs text-muted-foreground">
          Use the demo credentials shared by your team.
        </p>
      )}
    </AuthLayout>
  );
}
