import { NextResponse } from 'next/server';
import { requestSchema } from '@/domain/model';
import { loadState } from '@/server/state';
import { readBody, failure } from '@/server/http';
import { savedDemoMeals } from '@/server/demo-meals';

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await readBody(request));
    return NextResponse.json(savedDemoMeals(await loadState(), input), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
