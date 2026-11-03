import {
  mealGenerationStages,
  type MealGenerationEvent,
  type MealGenerationResult,
  type MealGenerationStage,
} from '@/domain/meal-generation';
import type { MealRequest } from '@/domain/model';
import { ApiError } from './api';

const interrupted = 'The connection ended before your meals were ready. Try again.';
const maxEventLength = 500_000;

function parseEvent(line: string): MealGenerationEvent {
  let event: MealGenerationEvent;
  try {
    event = JSON.parse(line) as MealGenerationEvent;
  } catch {
    throw new Error(interrupted);
  }
  if (!event || typeof event !== 'object') throw new Error(interrupted);
  if (event.type === 'stage' && mealGenerationStages.includes(event.stage)) return event;
  if (
    event.type === 'result' &&
    Array.isArray(event.result?.meals) &&
    event.result.meals.length <= 3 &&
    typeof event.result.message === 'string'
  )
    return event;
  if (event.type === 'error' && typeof event.error === 'string' && Number.isInteger(event.status))
    return event;
  throw new Error(interrupted);
}

/** Recipes cross this boundary only after independent server validation. */
export async function readMealGeneration(
  response: Response,
  onStage: (stage: MealGenerationStage) => void,
): Promise<MealGenerationResult> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error ?? interrupted, response.status);
  }
  // JSON clients and test fixtures can keep using the same endpoint.
  if (!response.headers.get('content-type')?.includes('application/x-ndjson'))
    return response.json();
  if (!response.body) throw new Error(interrupted);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: MealGenerationResult | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    if (line.length > maxEventLength) throw new Error(interrupted);
    const event = parseEvent(line);
    if (event.type === 'error') throw new ApiError(event.error, event.status);
    if (event.type === 'stage') onStage(event.stage);
    if (event.type === 'result') result = event.result;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (pending.length > maxEventLength) throw new Error(interrupted);
      if (done) break;
    }
    consume(pending);
    if (!result) throw new Error(interrupted);
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function generateMeals(
  request: MealRequest,
  onStage: (stage: MealGenerationStage) => void,
  signal: AbortSignal,
) {
  const response = await fetch('/api/meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    cache: 'no-store',
    signal,
  });
  return readMealGeneration(response, onStage);
}
