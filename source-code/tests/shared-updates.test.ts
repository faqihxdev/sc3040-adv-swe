import { describe, expect, it } from 'vitest';
import type { Activity, AppState, Item } from '@/domain/model';
import { sharedUpdates } from '@/domain/shared-updates';

const rice: Item = {
  id: 'rice',
  household_id: 'home',
  name: 'Rice',
  quantity: 500,
  unit: 'g',
  version: 1,
  deleted: false,
  updated_at: '',
  updated_by: 'alex',
  expiry_date: '2099-12-31',
  category: 'Grains',
  location: 'Pantry',
};
const initial: AppState = {
  user: { id: 'alex', email: '', display_name: 'Alex' },
  household: { id: 'home', name: 'Home', owner_id: 'alex', version: 1, locations: [] },
  members: [
    { id: 'alex', display_name: 'Alex' },
    { id: 'sam', display_name: 'Sam' },
  ],
  items: [rice],
  activity: [{ id: 10, actor_id: 'sam', action: 'add_item', label: 'Rice', created_at: '' }],
  outcomes: [],
  exclusions: [],
  aiEnabled: false,
};
function updated(actor = 'sam', action = 'edit_item', patch: Partial<Item> = {}) {
  return {
    ...initial,
    items: [{ ...rice, quantity: 400, version: 2, updated_by: actor, ...patch }],
    activity: [
      { id: 11, actor_id: actor, action, label: 'Rice', created_at: '' },
      ...initial.activity,
    ],
  };
}

describe('shared update feedback', () => {
  it('stays quiet on unchanged refreshes and initial data', () => {
    expect(sharedUpdates(initial, structuredClone(initial))).toEqual({
      highlights: {},
      notice: null,
    });
  });
  it('names the member and shows the quantity change', () => {
    expect(sharedUpdates(initial, updated())).toEqual({
      highlights: { rice: { version: 2, fields: ['amount'] } },
      notice: { title: 'Sam updated Rice', description: '500 g → 400 g' },
    });
  });
  it('highlights own writes without a second success notification', () => {
    expect(sharedUpdates(initial, updated('alex'))).toEqual({
      highlights: { rice: { version: 2, fields: ['amount'] } },
      notice: null,
    });
  });
  it('does not repeat a notification on the next poll', () => {
    expect(sharedUpdates(updated(), structuredClone(updated()))).toEqual({
      highlights: {},
      notice: null,
    });
  });
  it('shows remote additions and removals', () => {
    const added = updated('sam', 'add_item', { id: 'new-rice' });
    expect(sharedUpdates(initial, added).notice?.title).toBe('Sam added Rice');
    expect(sharedUpdates(initial, added).highlights).toEqual({
      'new-rice': { version: 2, fields: ['name', 'amount', 'category', 'location', 'expiry'] },
    });
    expect(sharedUpdates(initial, { ...updated('sam', 'remove_item'), items: [] })).toEqual({
      highlights: {},
      notice: { title: 'Sam removed Rice', description: '' },
    });
  });
  it('shows undo and quantity adjustments', () => {
    expect(sharedUpdates(initial, updated('sam', 'undo')).notice?.title).toBe(
      'Sam undid a change to Rice',
    );
    expect(sharedUpdates(initial, updated('sam', 'adjust_item')).notice?.title).toBe(
      'Sam updated Rice',
    );
  });
  it('does not show a quantity comparison for an expiry-only change', () => {
    const result = sharedUpdates(
      initial,
      updated('sam', 'edit_item', { quantity: 500, expiry_date: '2099-11-30' }),
    );
    expect(result.notice?.description).toBe('');
    expect(result.highlights).toEqual({ rice: { version: 2, fields: ['expiry'] } });
  });
  it('tracks each visible field independently', () => {
    const result = sharedUpdates(
      initial,
      updated('sam', 'edit_item', {
        quantity: 500,
        name: 'Brown rice',
        category: 'Other',
        location: 'Fridge',
      }),
    );
    expect(result.highlights.rice.fields).toEqual(['name', 'category', 'location']);
    expect(
      sharedUpdates(initial, updated('sam', 'edit_item', { quantity: 500, unit: 'ml' })).highlights
        .rice.fields,
    ).toEqual(['amount']);
  });
  it('ignores version-only writes and tracks repeated amount changes', () => {
    expect(
      sharedUpdates(initial, updated('sam', 'edit_item', { quantity: 500 })).highlights,
    ).toEqual({});
    expect(
      sharedUpdates(updated(), updated('sam', 'edit_item', { quantity: 300, version: 3 }))
        .highlights,
    ).toEqual({ rice: { version: 3, fields: ['amount'] } });
  });
  it('batches remote changes and excludes own activity', () => {
    const next = updated();
    next.activity.unshift(
      { ...next.activity[0], id: 12 },
      { ...next.activity[0], id: 13, actor_id: 'alex' },
    );
    expect(sharedUpdates(initial, next).notice?.title).toBe('Sam made 2 updates');
  });
  it('announces reset once without highlighting the whole seed', () => {
    const next = updated('sam', 'demo_reset', { id: 'new-rice' });
    next.activity = [next.activity[0]];
    expect(sharedUpdates(initial, next)).toEqual({
      highlights: {},
      notice: {
        title: 'Demo data restored',
        description: 'Sample stock and history restored. Dietary exclusions cleared.',
      },
    });
  });
  it('stays quiet when changing household or signing in as another user', () => {
    expect(sharedUpdates(initial, { ...updated(), household: null }).notice).toBeNull();
    expect(
      sharedUpdates(initial, { ...updated(), household: { ...initial.household!, id: 'other' } })
        .highlights,
    ).toEqual({});
    expect(
      sharedUpdates(initial, { ...updated(), user: { ...initial.user, id: 'sam' } }).notice,
    ).toBeNull();
  });
  it('handles a departed member and unordered activity', () => {
    const next = updated();
    next.members = [];
    const oldActivity = { ...next.activity[0], id: 9, label: 'Old item' };
    next.activity = [oldActivity, ...next.activity];
    expect(sharedUpdates(initial, next).notice?.title).toBe('Sam updated Rice');
    next.activity = [{ ...next.activity[1], actor_id: null } as Activity];
    expect(sharedUpdates(initial, next).notice?.title).toBe('A household member updated Rice');
  });
});
