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
  mocks.generate.mockReset();
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
  vi.restoreAllMocks();
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
  test('requests three feasible options while allowing genuinely limited inventory', async () => {
    await recommend(kitchen, request);
    const options = mocks.generate.mock.calls[0][0];
    expect(options.system).toContain('Return three distinct feasible meals');
    expect(options.system).toContain('If fewer than three');
    expect(options.system).toContain('brief reason in message');
  });
  test('preserves the reason for fewer feasible options', async () => {
    mocks.generate.mockResolvedValue({
      output: {
        meals: [recipe([rice.id])],
        message: 'Only one feasible meal fits the available ingredients.',
      },
      usage: {},
    });
    const result = await recommend(kitchen, request);
    expect(result.meals).toHaveLength(1);
    expect(result.message).toBe('Only one feasible meal fits the available ingredients.');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  test.each([0, 1, 2, 3])(
    'accepts %i feasible options without an unnecessary repair',
    async (count) => {
      mocks.generate.mockResolvedValue({
        output: {
          meals: Array.from({ length: count }, (_, index) =>
            recipe([rice.id], { name: `Option ${index + 1}` }),
          ),
          message: '',
        },
        usage: {},
      });
      const result = await recommend(kitchen, request);
      expect(result.meals).toHaveLength(count);
      expect(mocks.generate).toHaveBeenCalledTimes(1);
      expect(Boolean(result.message)).toBe(count < 3);
    },
  );
  test('allows slower responses while keeping both attempts within one request deadline', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    mocks.generate.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(30_000);
      return {
        output: { meals: [recipe(['unknown'])], message: '' },
        usage: {},
      };
    });
    expect((await recommend(kitchen, request)).meals).toHaveLength(1);
    expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([35_000, 20_000]);
  });
  test('explains partial validation results without showing rejected recipes', async () => {
    mocks.generate.mockResolvedValue({
      output: {
        meals: [recipe([rice.id]), recipe(['unknown'], { name: 'Invalid' })],
        message: 'Two feasible options.',
      },
      usage: {},
    });
    const result = await recommend(kitchen, request);
    expect(result.meals).toHaveLength(1);
    expect(result.message).toBe('1 suggestion passed ingredient and exclusion checks.');
  });
  test('repairs rejected candidates once, retains valid meals and records combined usage', async () => {
    mocks.generate
      .mockResolvedValueOnce({
        output: {
          meals: [recipe([rice.id], { name: 'First' }), recipe(['unknown'], { name: 'Rejected' })],
          message: '',
        },
        usage: { inputTokens: 100, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        output: {
          meals: [recipe([rice.id], { name: 'Second' }), recipe([rice.id], { name: 'Third' })],
          message: '',
        },
        usage: { inputTokens: 300, outputTokens: 400 },
      });
    const result = await recommend(kitchen, request);
    expect(result.meals.map((meal) => meal.name)).toEqual(['First', 'Second', 'Third']);
    expect(result.message).toBe('');
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    const repair = JSON.parse(mocks.generate.mock.calls[1][0].prompt).repair;
    expect(repair).toMatchObject({ acceptedMealNames: ['First'] });
    expect(repair.previousMeals).toHaveLength(2);
    expect(mocks.rpc.mock.calls.filter((call) => call[0] === 'reserve_ai')).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith('record_ai_usage', {
      call_id: 'reservation',
      inputs: 400,
      outputs: 600,
    });
    expect(kitchen.items[0].stock).toBe(3);
  });
  test('a failed repair keeps the valid first-pass meal', async () => {
    mocks.generate
      .mockResolvedValueOnce({
        output: {
          meals: [recipe([rice.id]), recipe(['unknown'], { name: 'Rejected' })],
          message: '',
        },
        usage: { inputTokens: 100, outputTokens: 200 },
      })
      .mockRejectedValueOnce(new Error('Repair unavailable'));
    const result = await recommend(kitchen, request);
    expect(result.meals).toHaveLength(1);
    expect(result.message).toBe('1 suggestion passed ingredient and exclusion checks.');
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
  test('a malformed-output retry shares the same two-call limit as validation repair', async () => {
    mocks.generate.mockRejectedValueOnce(mocks.malformed).mockResolvedValueOnce({
      output: {
        meals: [recipe([rice.id]), recipe(['unknown'], { name: 'Rejected' })],
        message: '',
      },
      usage: {},
    });
    expect((await recommend(kitchen, request)).meals).toHaveLength(1);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
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
