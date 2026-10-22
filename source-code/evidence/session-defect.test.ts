import { test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

const local = parseEnv(readFileSync('.env.local', 'utf8'));
if (new URL(local.NEXT_PUBLIC_SUPABASE_URL!).hostname !== '127.0.0.1')
  throw new Error('Session evidence requires local Supabase.');

for (const scope of ['global', 'local'] as const) {
  test(`EV-DEF-02: ${scope} sign-out ${scope === 'global' ? 'revokes' : 'preserves'} another session's refresh`, async () => {
    const url = local.NEXT_PUBLIC_SUPABASE_URL!;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(url, local.SUPABASE_SERVICE_ROLE_KEY!, options);
    const credentials = {
      email: `session-evidence-${randomUUID()}@useeatnow.test`,
      password: `Local-${randomUUID()}!`,
    };
    const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Session fixture creation failed.');
    try {
      const first = createClient(url, local.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
      const second = createClient(url, local.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
      expect((await first.auth.signInWithPassword(credentials)).error === null).toBe(true);
      expect((await second.auth.signInWithPassword(credentials)).error === null).toBe(true);
      expect((await first.auth.signOut({ scope })).error === null).toBe(true);
      const renewed = await second.auth.refreshSession();
      expect(renewed.error === null).toBe(scope === 'local');
      expect(Boolean(renewed.data.session)).toBe(scope === 'local');
    } finally {
      if ((await admin.auth.admin.deleteUser(created.data.user.id)).error)
        throw new Error('Session fixture cleanup failed.');
    }
  }, 30_000);
}
