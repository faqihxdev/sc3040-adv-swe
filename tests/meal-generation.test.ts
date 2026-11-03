import { describe, expect, test } from 'vitest';
import { readMealGeneration } from '@/lib/meal-generation';
import type { MealGenerationStage } from '@/domain/meal-generation';

function stream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}
describe('meal generation transport', () => {
  test('delivers real stages and a result split across network chunks', async () => {
    const stages: MealGenerationStage[] = [];
    const result = await readMealGeneration(
      stream([
        '{"type":"stage","stage":"gener',
        'ating"}\n{"type":"stage","stage":"validating"}\n',
        '{"type":"result","result":{"meals":[],"message":"No feasible meals."}}',
      ]),
      (stage) => stages.push(stage),
    );
    expect(stages).toEqual(['generating', 'validating']);
    expect(result).toEqual({ meals: [], message: 'No feasible meals.' });
  });
  test('keeps JSON compatibility', async () => {
    const response = Response.json({ meals: [], message: 'Limited inventory.' });
    expect(await readMealGeneration(response, () => undefined)).toEqual({
      meals: [],
      message: 'Limited inventory.',
    });
  });
  test('preserves HTTP and streamed quota errors', async () => {
    await expect(
      readMealGeneration(
        Response.json({ error: 'Request cap reached.' }, { status: 429 }),
        () => undefined,
      ),
    ).rejects.toMatchObject({ status: 429, message: 'Request cap reached.' });
    await expect(
      readMealGeneration(
        stream(['{"type":"error","error":"Request cap reached.","status":429}\n']),
        () => undefined,
      ),
    ).rejects.toMatchObject({ status: 429, message: 'Request cap reached.' });
  });
  test.each([
    '{"type":"stage","stage":"generating"}\n',
    '{"type":"stage","stage":"invented"}\n',
    '{"type":"result","result":{}}\n',
    'null\n',
    'invalid json\n',
    'x'.repeat(500_001),
  ])('rejects incomplete, invalid or oversized events', async (input) => {
    await expect(readMealGeneration(stream([input]), () => undefined)).rejects.toThrow();
  });
});
