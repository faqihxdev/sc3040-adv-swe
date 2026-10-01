import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from './errors';
export function assertRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = [process.env.APP_ORIGIN];
  if (process.env.NODE_ENV !== 'production')
    allowed.push('http://127.0.0.1:3000', 'http://localhost:3000');
  if (!origin || !allowed.includes(origin))
    throw new AppError('Request origin is not allowed.', 403);
}
export async function readBytes(request: Request, limit: number) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > limit) throw new AppError('Request is too large.', 413);
  if (!request.body) throw new AppError('Request body is empty.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError('Request is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
export async function readBody(request: Request) {
  assertRequestOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('Expected JSON.', 415);
  const body = (await readBytes(request, 120000)).toString('utf8');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AppError('Invalid request body.');
  }
}
export function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? 'Check your inputs.' },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: 'The request could not be completed. Nothing was reported as saved. Try again.' },
    { status: 500 },
  );
}
export function databaseError(error: { code: string; message: string }): never {
  if (['PT409', 'PT429', '42501', 'P0001'].includes(error.code))
    throw new AppError(
      error.message,
      error.code === 'PT409'
        ? 409
        : error.code === 'PT429'
          ? 429
          : error.code === '42501'
            ? 403
            : 400,
    );
  throw new AppError('The change could not be saved. Refresh and try again.', 503);
}
