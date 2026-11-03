import { NextResponse } from 'next/server';
import { confirmationSchema } from '@/domain/model';
import { loadState, AppError } from '@/server/state';
import { readBody, failure, databaseError } from '@/server/http';
import { verifyMeal } from '@/server/meal-token';
import { adminDb } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
export async function POST(request: Request) {
  try {
    const input = confirmationSchema.parse(await readBody(request));
    const state = await loadState();
    if (!state.household) throw new AppError('Join a household first.');
    const ticket = verifyMeal(input.token, state.user.id, state.household.id);
    if (
      new Set(input.changes.map((i) => i.id)).size !== ticket.trackedIds.length ||
      input.changes.length !== ticket.trackedIds.length ||
      input.changes.some((i) => !ticket.trackedIds.includes(i.id))
    )
      throw new AppError('Review every tracked recipe ingredient.');
    if (input.changes.some((change) => change.discardedAmount > 0 && !change.discardReason))
      throw new AppError('Choose a reason for discarded food.');
    const { data, error } = await adminDb().rpc('confirm_reserved_meal', {
      actor: state.user.id,
      household: state.household.id,
      session_id: ticket.id,
      recipe_data: {
        ...ticket.recipe,
        ...(ticket.source ? { source: ticket.source } : {}),
      } as unknown as Json,
      changes: input.changes,
    });
    if (error) databaseError(error);
    return NextResponse.json({ id: data });
  } catch (e) {
    return failure(e);
  }
}
