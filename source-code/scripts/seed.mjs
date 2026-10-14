import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { makeDemoSeed } from '../src/domain/demo-data.ts';
const hosted = process.argv.includes('--hosted');
process.loadEnvFile(hosted ? '.env.hosted' : '.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const local = url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
if (hosted) {
  const ref = process.env.DEMO_SEED_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || url !== `https://${ref}.supabase.co`)
    throw new Error('Hosted seed target must match DEMO_SEED_PROJECT_REF exactly.');
} else if (!local) throw new Error('Use --hosted explicitly for the allowlisted demo project.');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  throw new Error('Supabase seed credentials are missing.');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const users = [
  {
    email: 'alex@useeatnow.test',
    name: 'Alex',
    household: 'The good food club',
    password: process.env.DEMO_ALEX_PASSWORD || (hosted ? undefined : 'UseEatNow!2026'),
  },
  {
    email: 'sam@useeatnow.test',
    name: 'Sam',
    password: process.env.DEMO_SAM_PASSWORD || (hosted ? undefined : 'UseEatNow!2026'),
  },
  ...(!hosted
    ? [
        {
          email: 'jo@useeatnow.test',
          name: 'Jo',
          household: 'Another kitchen',
          password: process.env.DEMO_JO_PASSWORD || 'UseEatNow!2026',
        },
      ]
    : []),
];
if (hosted && users.some((u) => !u.password || u.password.length < 8))
  throw new Error('Each hosted demo account needs a private password of at least 8 characters.');
const { data: existing, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;
const sessions = [];
for (const u of users) {
  let user = existing.users.find((x) => x.email === u.email);
  if (!user) {
    const r = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name },
    });
    if (r.error) throw r.error;
    user = r.data.user;
  }
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const auth = await db.auth.signInWithPassword({ email: u.email, password: u.password });
  if (auth.error) throw auth.error;
  const household = await db.from('households').select('*').maybeSingle();
  if (household.error) throw household.error;
  let h = household.data;
  if (!h && u.household) {
    const r = await db.rpc('mutate', {
      command: 'create_household',
      payload: { name: u.household },
    });
    if (r.error) throw r.error;
    const household = await db.from('households').select('*').single();
    if (household.error) throw household.error;
    h = household.data;
  }
  sessions.push({ db, user, h });
}
const owner = sessions[0];
const member = sessions[1];
if (!member.h) {
  const invite = await owner.db.rpc('mutate', { command: 'invite', payload: {} });
  if (invite.error) throw invite.error;
  const r = await member.db.rpc('mutate', {
    command: 'join_household',
    payload: { code: invite.data.code },
  });
  if (r.error) throw r.error;
}
const existingItems = await owner.db.from('inventory').select('id').limit(1);
if (existingItems.error) throw existingItems.error;
if (!existingItems.data?.length) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const generated = makeDemoSeed(today, randomUUID);
  const currentHousehold = await owner.db.from('households').select('id,version').single();
  if (currentHousehold.error) throw currentHousehold.error;
  const history = generated.outcomes.map((outcome, n) => ({
    ...outcome,
    actor_id: n % 2 ? owner.user.id : member.user.id,
  }));
  const r = await admin.rpc('reset_demo', {
    actor: owner.user.id,
    household: currentHousehold.data.id,
    expected_version: currentHousehold.data.version,
    items_data: generated.items,
    outcomes_data: history,
    events_data: generated.events,
  });
  if (r.error) throw r.error;
  console.log(
    `Added ${generated.items.length} sample ingredients and 14 clearly marked synthetic meal records.`,
  );
} else console.log('Existing inventory retained; no duplicate sample records added.');
console.log(
  hosted
    ? 'Hosted demo: Alex (owner) and Sam (member). Private credentials remain in ignored .env.hosted.'
    : 'Local demo: Alex (owner), Sam (member), Jo (separate household). See README for local credentials.',
);
