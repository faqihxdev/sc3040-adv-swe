import { NextResponse } from 'next/server';
import { mealImageRequestSchema } from '@/domain/meal-image';
import { readBody, failure } from '@/server/http';
import { loadState } from '@/server/state';
import { verifyMeal } from '@/server/meal-token';
import { createMealImage } from '@/server/meal-images';
import { AppError } from '@/server/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = mealImageRequestSchema.parse(await readBody(request));
    const state = await loadState();
    if (!state.household) throw new AppError('Join a household first.', 403);
    const ticket = verifyMeal(input.token, state.user.id, state.household.id);
    if (ticket.source === 'saved-demo')
      throw new AppError('Saved demo recipes use prepared illustrations.', 409);
    return NextResponse.json(await createMealImage(state, input.token, ticket, request.signal), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
