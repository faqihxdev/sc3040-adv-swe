import { NextResponse } from 'next/server';
import { requestSchema } from '@/domain/model';
import { loadState } from '@/server/state';
import { readBody, failure } from '@/server/http';
import { recommend } from '@/server/recommendations';
import type { MealGenerationEvent } from '@/domain/meal-generation';

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await readBody(request));
    const state = await loadState();
    if (!request.headers.get('accept')?.includes('application/x-ndjson'))
      return NextResponse.json(await recommend(state, input, { signal: request.signal }));
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function send(event: MealGenerationEvent) {
          if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
        try {
          const result = await recommend(state, input, {
            onStage: (stage) => send({ type: 'stage', stage }),
            signal,
          });
          send({ type: 'result', result });
        } catch (cause) {
          if (!signal.aborted) {
            const response = failure(cause);
            const body = await response.json();
            send({ type: 'error', error: body.error, status: response.status });
          }
        } finally {
          if (!abort.signal.aborted) controller.close();
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
