import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadState, AppError } from '@/server/state';
import { adminDb } from '@/lib/supabase/server';
import { readBody, failure, databaseError } from '@/server/http';
import { makeDemoSeed } from '@/domain/demo-data';
import { todaySingapore } from '@/domain/meals';
import type { Json } from '@/lib/database.types';

const inputSchema = z.object({
  householdId: z.uuid(),
  version: z.number().int().positive(),
  confirmation: z.literal('RESET'),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await readBody(request));
    if (process.env.DEMO_MODE !== 'true' || !process.env.DEMO_HOUSEHOLD_ID)
      throw new AppError('Demo reset is unavailable.', 403);
    const state = await loadState();
    if (
      !state.demoResetEnabled ||
      state.household?.id !== input.householdId ||
      input.householdId !== process.env.DEMO_HOUSEHOLD_ID
    )
      throw new AppError('Only the demo household owner can reset its data.', 403);
    const seed = makeDemoSeed(todaySingapore(), randomUUID);
    const { error } = await adminDb().rpc('reset_demo', {
      actor: state.user.id,
      household: input.householdId,
      expected_version: input.version,
      items_data: seed.items as unknown as Json,
      outcomes_data: seed.outcomes.map((outcome, n) => ({
        ...outcome,
        actor_id: state.members[n % state.members.length]?.id ?? state.user.id,
      })) as unknown as Json,
      events_data: seed.events as unknown as Json,
    });
    if (error) databaseError(error);
    try {
      return NextResponse.json(await loadState(), { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      throw new AppError(
        'Demo data was reset, but the view could not refresh. Reload this page.',
        503,
      );
    }
  } catch (error) {
    return failure(error);
  }
}
