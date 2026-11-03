import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './rules-fixtures';

const mocks = vi.hoisted(() => ({
  loadState: vi.fn(),
  recommend: vi.fn(),
}));
vi.mock('@/server/state', () => ({ loadState: mocks.loadState }));
vi.mock('@/server/recommendations', () => ({ recommend: mocks.recommend }));

import { POST } from '@/app/api/meals/route';

const state = {
  user: { id: 'owner', email: 'owner@tests.invalid', display_name: 'Owner' },
  household: { id: 'kitchen', name: 'Test', owner_id: 'owner', version: 1, locations: [] },
  items: [],
  members: [],
  activity: [],
  outcomes: [],
  exclusions: [],
  aiEnabled: true,
};
const result = { meals: [], message: 'No feasible meals found.' };

beforeEach(() => {
  mocks.loadState.mockResolvedValue(state);
  mocks.recommend.mockResolvedValue(result);
});

const makeRequest = (accept?: string) =>
  new Request('http://127.0.0.1:3000/api/meals', {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
      ...(accept ? { accept } : {}),
    },
    body: JSON.stringify(request),
  });

describe('meal generation route', () => {
  it('keeps the default JSON response contract', async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.recommend).toHaveBeenCalledWith(
      state,
      request,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('streams stage events and a final result as newline-delimited JSON', async () => {
    mocks.recommend.mockImplementation(async (_state, _request, options) => {
      options.onStage('preparing');
      options.onStage('generating');
      return result;
    });
    const response = await POST(makeRequest('application/x-ndjson'));
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: 'stage', stage: 'preparing' },
      { type: 'stage', stage: 'generating' },
      { type: 'result', result },
    ]);
  });

  it('maps validation failures to the existing JSON error shape', async () => {
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/meals', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, servings: 0 }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Too small: expected number to be >=1' });
    expect(mocks.loadState).not.toHaveBeenCalled();
  });
});
