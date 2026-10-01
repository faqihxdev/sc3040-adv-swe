import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppState } from '@/domain/model';
import { ingredient, request, recipe } from './rules-fixtures';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  rpc: vi.fn(),
  malformed: new Error('Malformed external response'),
}));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: mocks.generate,
  NoObjectGeneratedError: { isInstance: (error: unknown) => error === mocks.malformed },
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ responses: (model: string) => model }),
}));
vi.mock('@/lib/supabase/server', () => ({ adminDb: () => ({ rpc: mocks.rpc }) }));
import { recommend } from '@/server/recommendations';
import { verifyMeal } from '@/server/meal-token';

const rice = ingredient('11111111-1111-4111-8111-111111111111');
const kitchen: AppState = {
  user: { id: 'owner', email: 'owner@tests.invalid', display_name: 'Owner' },
  household: { id: 'kitchen', name: 'Test', owner_id: 'owner', version: 1, locations: [] },
  items: [rice],
  members: [],
  activity: [],
  outcomes: [],
  exclusions: [],
  aiEnabled: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T02:00:00Z'));
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'fake-test-only');
  vi.stubEnv('MEAL_SIGNING_SECRET', 'test-only-signing-secret-at-least-32-characters');
  mocks.rpc.mockResolvedValue({ data: 'reservation', error: null });
  mocks.generate.mockResolvedValue({
    output: { meals: [recipe([rice.id])], message: '' },
    usage: { inputTokens: 100, outputTokens: 200 },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('recommender boundary (mocked external provider)', () => {
  test('empty or excluded inventory makes no paid request', async () => {
    expect((await recommend({ ...kitchen, items: [] }, request)).meals).toEqual([]);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test('AI switch and missing credentials fail before any reservation', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    await expect(recommend(kitchen, request)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(recommend(kitchen, request)).rejects.toMatchObject({ status: 503 });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test('persistent quota refusal makes no model call', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT429', message: 'Request cap reached.' },
    });
    await expect(recommend(kitchen, request)).rejects.toMatchObject({ status: 429 });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  test('valid candidate is independently scored and signed without stock writes', async () => {
    const result = await recommend(kitchen, request);
    expect(result.meals[0]).toMatchObject({ score: 100, coverage: 1, points: 3, totalPoints: 3 });
    expect(verifyMeal(result.meals[0].token, 'owner', 'kitchen').trackedIds).toEqual([rice.id]);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      model: 'gpt-6-luna',
      maxRetries: 0,
      providerOptions: { openai: { reasoningEffort: 'medium', store: false } },
    });
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty('tools');
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['reserve_ai', 'record_ai_usage']);
    expect(kitchen.items[0].stock).toBe(3);
  });
  test('unrecognised ingredient IDs never reach the user', async () => {
    mocks.generate.mockResolvedValue({
      output: { meals: [recipe(['not-in-stock'])], message: '' },
      usage: {},
    });
    const result = await recommend(kitchen, request);
    expect(result.meals).toEqual([]);
    expect(result.message).toContain('No suggestions passed');
  });
  test('malformed structured output gets exactly one retry and one quota reservation', async () => {
    mocks.generate.mockRejectedValueOnce(mocks.malformed);
    expect((await recommend(kitchen, request)).meals).toHaveLength(1);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === 'reserve_ai')).toHaveLength(1);
  });
  test('provider failure does not retry indefinitely or mutate stock', async () => {
    mocks.generate.mockRejectedValue(new Error('Network unavailable'));
    await expect(recommend(kitchen, request)).rejects.toMatchObject({ status: 502 });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['reserve_ai']);
    expect(kitchen.items[0].stock).toBe(3);
  });
});
