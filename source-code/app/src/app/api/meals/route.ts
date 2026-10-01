import { NextResponse } from 'next/server';
import { requestSchema } from '@/domain/model';
import { loadState } from '@/server/state';
import { readBody, failure } from '@/server/http';
import { recommend } from '@/server/recommendations';
export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await readBody(request));
    return NextResponse.json(await recommend(await loadState(), input));
  } catch (e) {
    return failure(e);
  }
}
