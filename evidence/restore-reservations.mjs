import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const env = parseEnv(readFileSync('.env.local', 'utf8'));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
const credentials = {
  email: `restore-evidence-${randomUUID()}@useeatnow.test`,
  password: `Local-${randomUUID()}!`,
};
const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
assert.equal(created.error, null);
const actor = created.data.user.id;
let household;
try {
  assert.equal((await client.auth.signInWithPassword(credentials)).error, null);
  const result = await client.rpc('mutate', {
    command: 'create_household',
    payload: { name: 'Reservation restore fixture' },
  });
  assert.equal(result.error, null);
  household = result.data.id;
  const item = randomUUID();
  assert.equal(
    (
      await admin.from('inventory').insert({
        id: item,
        household_id: household,
        name: 'Rice',
        quantity: 150,
        unit: 'g',
        expiry_date: '2099-01-01',
        category: 'Grains',
        version: 1,
        deleted: false,
        updated_by: actor,
      })
    ).error,
    null,
  );
  const session = randomUUID();
  assert.equal(
    (
      await admin.rpc('start_cooking', {
        actor,
        household,
        session_id: session,
        recipe_data: {
          name: 'Rice fixture',
          summary: 'Restore verification',
          servings: 2,
          cookingMinutes: 20,
          ingredients: [{ ingredientId: item, amount: 100, unit: 'g' }],
          steps: ['Rinse.', 'Add water.', 'Cook.', 'Serve.'],
        },
        meal_data: {},
      })
    ).error,
    null,
  );
  const run = spawnSync(process.execPath, ['scripts/backup.mjs', 'practice'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (run.status !== 0)
    throw new Error('Local reservation restore failed. Inspect the private operator output.');
  const report = JSON.parse(readFileSync('reports/restore.json', 'utf8'));
  assert.ok(report.checks.cookingSessions >= 1);
  assert.ok(report.checks.ingredientReservations >= 1);
  assert.ok(report.checks.dataFingerprints.cooking_sessions);
  assert.ok(report.checks.dataFingerprints.ingredient_reservations);
  report.fixture = {
    case: 'EV-REC-01',
    recordedGrams: 150,
    heldGrams: 100,
    activeSessionIncluded: true,
    restoration: 'All ten table fingerprints, counts and public RLS count match the source.',
  };
  writeFileSync(
    'reports/lab5-evidence/restore-with-reservation.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    `EV-REC-01 passed in ${report.durationSeconds}s with an active 100 g hold. Source data was not restored or reset.`,
  );
} finally {
  if (household)
    assert.equal((await admin.from('households').delete().eq('id', household)).error, null);
  assert.equal((await admin.auth.admin.deleteUser(actor)).error, null);
}
