import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/database.types';
import { adminDb } from '@/lib/supabase/server';
import { loadState, AppError } from '@/server/state';
import {
  cookingFromTicket,
  restoreCookingSession,
  type StoredCookingSession,
} from '@/server/cooking';
import { readBody, failure, databaseError } from '@/server/http';

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), token: z.string().min(1).max(100000) }),
  z.object({ action: z.enum(['cancel', 'renew']), sessionId: z.uuid() }),
]);

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readBody(request));
    const state = await loadState();
    if (!state.household) throw new AppError('Join a household first.');
    const db = adminDb();
    if (input.action === 'start') {
      const { ticket, meal, recipe } = cookingFromTicket(input.token, state);
      const { data, error } = await db.rpc('start_cooking', {
        actor: state.user.id,
        household: state.household.id,
        session_id: ticket.id,
        recipe_data: recipe as unknown as Json,
        meal_data: meal as unknown as Json,
      });
      if (error) databaseError(error);
      return NextResponse.json(
        restoreCookingSession(
          data as unknown as StoredCookingSession,
          state.user.id,
          state.household.id,
        ),
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    const { error } = await db.rpc('manage_cooking', {
      actor: state.user.id,
      household: state.household.id,
      session_id: input.sessionId,
      action: input.action,
    });
    if (error) databaseError(error);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}
