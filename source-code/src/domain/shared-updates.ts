import type { AppState } from './model';
import { formatQuantity } from './quantities';

export type InventoryField = 'name' | 'amount' | 'category' | 'location' | 'expiry';
export type InventoryHighlight = { version: number; fields: InventoryField[] };
export type InventoryHighlights = Record<string, InventoryHighlight>;

export function sharedUpdates(previous: AppState, current: AppState) {
  const highlights: InventoryHighlights = {};
  if (
    !current.household ||
    previous.household?.id !== current.household.id ||
    previous.user.id !== current.user.id
  )
    return { highlights, notice: null };

  const lastId = Math.max(0, ...previous.activity.map((entry) => entry.id));
  const activity = current.activity.filter((entry) => entry.id > lastId);
  const reset = activity.some((entry) => entry.action === 'demo_reset');
  const oldItems = new Map(previous.items.map((item) => [item.id, item]));
  const changed = current.items.filter((item) => oldItems.get(item.id)?.version !== item.version);
  if (!reset) {
    for (const item of changed) {
      const before = oldItems.get(item.id);
      const fields: InventoryField[] = [];
      if (!before || before.name !== item.name) fields.push('name');
      if (!before || before.quantity !== item.quantity || before.unit !== item.unit)
        fields.push('amount');
      if (!before || before.category !== item.category) fields.push('category');
      if (!before || before.location !== item.location) fields.push('location');
      if (!before || before.expiry_date !== item.expiry_date) fields.push('expiry');
      if (fields.length) highlights[item.id] = { version: item.version, fields };
    }
  }

  const shared = activity.filter((entry) => entry.actor_id !== current.user.id);
  if (!shared.length) return { highlights, notice: null };
  const latest = shared.reduce((left, right) => (left.id > right.id ? left : right));
  const actor =
    current.members.find((member) => member.id === latest.actor_id)?.display_name ??
    previous.members.find((member) => member.id === latest.actor_id)?.display_name ??
    'A household member';
  let title = `${actor} updated the household`;
  let description = latest.label;
  if (shared.some((entry) => entry.action === 'demo_reset')) {
    title = 'Demo data restored';
    description = 'Sample stock and history restored. Dietary exclusions cleared.';
  } else if (shared.length > 1) {
    title = shared.every((entry) => entry.actor_id === latest.actor_id)
      ? `${actor} made ${shared.length} updates`
      : `${shared.length} household updates`;
    description = 'Shared stock and activity are up to date.';
  } else {
    const verbs: Record<string, string> = {
      add_item: 'added',
      edit_item: 'updated',
      adjust_item: 'updated',
      remove_item: 'removed',
      undo: 'undid a change to',
      confirmed_meal: 'cooked',
    };
    const verb = verbs[latest.action];
    if (verb) {
      title = `${actor} ${verb} ${latest.label}`;
      description = '';
    }
    const item = changed.length === 1 ? changed[0] : undefined;
    const before = item && oldItems.get(item.id);
    if (
      item &&
      item.updated_by === latest.actor_id &&
      before &&
      (before.quantity !== item.quantity || before.unit !== item.unit)
    ) {
      description = `${formatQuantity(before.quantity, before.unit)} → ${formatQuantity(item.quantity, item.unit)}`;
    }
  }
  return { highlights, notice: { title, description } };
}
