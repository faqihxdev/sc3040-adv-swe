import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverDb: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc }),
}));
import { loadState } from '@/server/state';
const householdId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('DEMO_HOUSEHOLD_ID', householdId);
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'owner', email: 'owner@example.test' } },
    error: null,
  });
});

it('starts independent reads together instead of putting outcomes behind inventory', async () => {
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  mocks.from.mockImplementation((table: string) => {
    const wait = new Promise<void>((resolve) => releases.set(table, resolve));
    const query = {
      select: () => query,
      eq: () => query,
      single: () => query,
      maybeSingle: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        started.push(table);
        return wait.then(() =>
          resolve({
            error: null,
            data:
              table === 'profiles'
                ? { display_name: 'Alex', exclusions: [] }
                : table === 'households'
                  ? { id: householdId, owner_id: 'owner' }
                  : [],
          }),
        );
      },
    };
    return query;
  });
  mocks.rpc.mockImplementation(async () => {
    started.push('members');
    return { data: [], error: null };
  });
  const pending = loadState();
  const flush = async () => {
    for (let n = 0; n < 12; n++) await Promise.resolve();
  };
  await flush();
  expect(started).toEqual(expect.arrayContaining(['profiles', 'households']));
  releases.get('profiles')!();
  releases.get('households')!();
  await flush();
  expect(started).toEqual(expect.arrayContaining(['inventory', 'members', 'activity', 'outcomes']));
  releases.get('inventory')!();
  releases.get('activity')!();
  releases.get('outcomes')!();
  expect((await pending).demoResetEnabled).toBe(true);
});

it('fails closed on expired sessions before querying household data', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(loadState()).rejects.toMatchObject({ status: 401 });
  expect(mocks.from).not.toHaveBeenCalled();
});
