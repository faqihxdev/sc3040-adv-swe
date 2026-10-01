import { test, expect, signIn, state } from './fixtures';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';
import type { Database } from '../../src/lib/database.types';

test('SRS 5.1: six concurrent users load two isolated households with 50 items and 500 outcomes each', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== '127.0.0.1') throw new Error('Load tests require local Supabase.');
  const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const accounts: {
    id: string;
    email: string;
    password: string;
    householdId: string;
    group: number;
  }[] = [];
  const contexts: BrowserContext[] = [];
  try {
    for (let group = 0; group < 2; group++) {
      let householdId = '';
      let code = '';
      for (let member = 0; member < 3; member++) {
        const email = `load-${randomUUID()}@useeatnow.test`;
        const password = `Local-${randomUUID()}!`;
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: `Load user ${group}-${member}` },
        });
        if (created.error || !created.data.user)
          throw created.error ?? new Error('Load user not created.');
        const account = { id: created.data.user.id, email, password, householdId, group };
        accounts.push(account);
        const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { persistSession: false },
        });
        const login = await db.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
        if (member === 0) {
          const house = await db.rpc('mutate', {
            command: 'create_household',
            payload: { name: `Load kitchen ${group}` },
          });
          if (house.error) throw house.error;
          householdId = house.data.id;
          account.householdId = householdId;
          const invite = await db.rpc('mutate', { command: 'invite', payload: {} });
          if (invite.error) throw invite.error;
          code = invite.data.code;
        } else {
          const joined = await db.rpc('mutate', { command: 'join_household', payload: { code } });
          if (joined.error) throw joined.error;
        }
      }
      const items = Array.from({ length: 50 }, (_, i) => ({
        household_id: householdId,
        name: `Kitchen ${group} rice ${i}`,
        stock: 3,
        expiry_date: '2099-12-31',
      }));
      const saved = await admin.from('inventory').insert(items);
      if (saved.error) throw saved.error;
      const outcomes = Array.from({ length: 500 }, (_, i) => ({
        id: randomUUID(),
        household_id: householdId,
        recipe: { name: `Kitchen ${group} meal ${i}` },
        ingredients: [],
        synthetic: true,
      }));
      const recorded = await admin.from('outcomes').insert(outcomes);
      if (recorded.error) throw recorded.error;
    }
    const pages = [];
    for (const account of accounts) {
      const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, account);
      pages.push(page);
    }
    const start = performance.now();
    const loaded = await Promise.all(pages.map((page) => state(page)));
    const elapsedMs = Math.round(performance.now() - start);
    for (const [i, result] of loaded.entries()) {
      expect(result.household!.id).toBe(accounts[i].householdId);
      expect(result.members).toHaveLength(3);
      expect(result.items).toHaveLength(50);
      expect(
        result.items.every((item) => item.name.startsWith(`Kitchen ${accounts[i].group} `)),
      ).toBe(true);
      expect(result.outcomes).toHaveLength(500);
      expect(
        result.outcomes.every((outcome) =>
          outcome.recipe.name.startsWith(`Kitchen ${accounts[i].group} `),
        ),
      ).toBe(true);
    }
    mkdirSync('reports', { recursive: true });
    const evidence = {
      profile: '6 users / 2 households / 50 items + 500 outcomes each',
      requests: 6,
      elapsedMs,
      passed: true,
      scope: 'Concurrent local state reads only; not hosted capacity or live AI latency.',
    };
    writeFileSync(`reports/load-${testInfo.project.name}.json`, JSON.stringify(evidence, null, 2));
    await testInfo.attach('load-profile', {
      body: JSON.stringify(evidence),
      contentType: 'application/json',
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    for (const account of accounts) {
      const removed = await admin.from('households').delete().eq('owner_id', account.id);
      if (removed.error) throw removed.error;
    }
    for (const account of accounts) {
      const removed = await admin.auth.admin.deleteUser(account.id);
      if (removed.error) throw removed.error;
    }
  }
});
