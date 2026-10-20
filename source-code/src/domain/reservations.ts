import type { AppState, IngredientReservation, Item } from './model';

export function reservedAmount(
  itemId: string,
  reservations: IngredientReservation[] = [],
  exceptSessionId?: string,
  now = Date.now(),
) {
  return (
    Math.round(
      reservations
        .filter(
          (hold) =>
            hold.itemId === itemId &&
            hold.sessionId !== exceptSessionId &&
            Date.parse(hold.expiresAt) > now,
        )
        .reduce((sum, hold) => sum + hold.amount, 0) * 100,
    ) / 100
  );
}

/** Keep physical inventory unchanged. Use this projection for recipe feasibility only. */
export function availableItems(
  state: Pick<AppState, 'items' | 'reservations'>,
  exceptSessionId?: string,
): Item[] {
  return state.items.map((item) => ({
    ...item,
    quantity:
      item.quantity === null
        ? null
        : Math.max(
            0,
            Math.round(
              (item.quantity - reservedAmount(item.id, state.reservations, exceptSessionId)) * 100,
            ) / 100,
          ),
  }));
}
