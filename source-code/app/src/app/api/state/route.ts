import { NextResponse } from 'next/server';
import { loadState } from '@/server/state';
import { failure } from '@/server/http';
export async function GET() {
  try {
    return NextResponse.json(await loadState(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return failure(e);
  }
}
