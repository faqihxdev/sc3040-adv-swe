import 'server-only';
import { serverDb } from '@/lib/supabase/server';
import type { AppState, Outcome, QuantityEvent } from '@/domain/model';
import { AppError } from './errors';
export { AppError } from './errors';
export async function loadState(): Promise<AppState> {
  const db = await serverDb();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError && (!authError.status || authError.status >= 500))
    throw new AppError('Authentication is temporarily unavailable. Try again.', 503);
  if (authError || !user) throw new AppError('Sign in to continue.', 401);
  const [{ data: profile, error: pe }, { data: household, error: he }] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).single(),
    db.from('households').select('*').maybeSingle(),
  ]);
  if (pe) throw new AppError('Could not load account settings.', 503);
  if (he) throw new AppError('Could not load household.', 503);
  const base = {
    user: { id: user.id, email: user.email ?? '', display_name: profile.display_name },
    household,
    members: [],
    items: [],
    activity: [],
    outcomes: [],
    exclusions: profile.exclusions,
    aiEnabled: process.env.AI_ENABLED === 'true',
    demoResetEnabled:
      process.env.DEMO_MODE === 'true' &&
      household?.id === process.env.DEMO_HOUSEHOLD_ID &&
      household?.owner_id === user.id,
    quantityEvents: [],
  };
  if (!household) return base;
  const outcomePage = (offset: number) =>
    db
      .from('outcomes')
      .select('id,created_at,recipe,ingredients,synthetic')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 499);
  const eventPage = (offset: number) =>
    db
      .from('quantity_events')
      .select(
        'id,sequence,voided,item_id,name,category,unit,kind,amount,before_quantity,quantity,created_at,synthetic,discard_reason',
      )
      .order('created_at', { ascending: false })
      .order('sequence', { ascending: false })
      .range(offset, offset + 499);
  const [items, members, activity, firstOutcomes, firstEvents] = await Promise.all([
    db.from('inventory').select('*').eq('deleted', false).order('expiry_date'),
    db.rpc('member_directory'),
    db
      .from('activity')
      .select('id,actor_id,action,label,created_at')
      .order('id', { ascending: false })
      .limit(100),
    outcomePage(0),
    eventPage(0),
  ]);
  if (items.error || members.error || activity.error)
    throw new AppError('Could not refresh household data. Try again.', 503);
  // Paginate instead of silently truncating at the API row limit.
  if (firstOutcomes.error) throw new AppError('Could not load analytics.', 503);
  const outcomes = firstOutcomes.data as unknown as Outcome[];
  for (let offset = 500; outcomes.length === offset; offset += 500) {
    const r = await outcomePage(offset);
    if (r.error) throw new AppError('Could not load analytics.', 503);
    outcomes.push(...(r.data as unknown as Outcome[]));
    if (r.data.length < 500) break;
  }
  if (firstEvents.error) throw new AppError('Could not load quantity history.', 503);
  const quantityEvents = firstEvents.data as unknown as QuantityEvent[];
  for (let offset = 500; quantityEvents.length === offset; offset += 500) {
    const r = await eventPage(offset);
    if (r.error) throw new AppError('Could not load quantity history.', 503);
    quantityEvents.push(...(r.data as unknown as QuantityEvent[]));
    if (r.data.length < 500) break;
  }
  return {
    ...base,
    items: items.data as unknown as AppState['items'],
    members: members.data,
    activity: activity.data,
    outcomes,
    quantityEvents,
  };
}
