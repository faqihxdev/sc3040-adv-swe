# UseEatNow quick guide

Private demo: use the accounts shared by the team. Local accounts/setup are in
the [app README](../README.md).

## UC1: Find meals

- Cook → Find meals. Choose people, preferences and available staples; deselect anything absent.
- Next → inspect a recipe → Cook this. Selection leaves stock unchanged; cooking enables interactive steps.
- Scores show expiry-weighted ingredient coverage. Recipe quantities are checked separately.
- Dish illustrations load independently. If one fails, the recipe remains usable and its image can be retried.

## UC2: Inventory

- Add ingredient → Manual or Photo. Enter name, amount, unit and expiry; review and confirm.
- Amounts use g, ml or pieces, with up to two decimals. Keep the recorded unit when updating an item.
- Photo recognition suggests names/categories. Enter amounts, units and expiry dates yourself.
- Older items marked Set amount need an amount and unit before meal generation can use them.
- Use each row's actions to edit, restock, discard or remove. Discard requires an amount and reason; removal corrects the inventory record.
- Activity & undo reverses your latest safe inventory edit.

## UC3: Finish cooking

- Complete the steps → I've finished cooking.
- Review the prefilled used amounts. Expand waste details per ingredient to enter a discarded amount and reason.
- Left updates as current stock minus used minus discarded. Set both to zero for an unused item.
- Confirm meal saves the outcome and stock together. Cancelling leaves both unchanged.

## UC4: Insights

- Choose a period for Used near expiry, Waste over time, Why discarded and Waste hotspots.
- Used near expiry counts ingredient uses with 0–3 days remaining at confirmation. Older records without an expiry snapshot are untracked.
- Overview charts use counts. Exact amounts stay separate for g, ml and pieces.
- Waste share is discarded divided by used plus discarded for one ingredient and unit.
- Open metric help or supporting records for definitions and amounts. Weeks start Monday in Singapore time.
- Next actions and Expiry outlook use current inventory. Select a range, then Cook or Review an item.

## UC5: Access/preferences

- Sign in from the public landing page. Local signup/recovery are available outside private-demo mode.
- Household → Dietary exclusions → Save. Exclusions override preferences; check allergens yourself.

## UC6: Household/account

- Create or join with the owner's invite code. Owners can invite, remove members or transfer ownership; members can leave.
- Saved changes refresh immediately; other active clients refresh on focus and poll every 30 seconds.
- Changed inventory rows briefly highlight. Updates from other members show a notification.
- Account controls appearance, sign out and typed account deletion. Owners first transfer ownership or delete the household.

## Conflicts and safety

- Conflicting write: reload current state and review again. Retry the same failed confirmation.
- `Cook this` reserves recipe portions. Inventory shows the reserved amount, member and remaining availability. Refreshing restores the cooking session.
- Confirm actual use and waste to release unused portions, or choose End session to release everything. Reservations expire after two hours away from the app.
- AI failure: preferences remain saved. Use Try again or Change preferences.
- Past-date/depleted items remain in records and are excluded from recommendations.
- Amounts and dates are self-reported. Check actual availability and food safety before cooking.
- Recorded activity does not establish how much waste was prevented.

## Demo reset

- Account → Reset to seed is available only to the allowlisted demo owner.
- Reset restores sample inventory/history and clears dietary exclusions for all household members.
- Accounts, passwords, membership and AI usage are kept. Open sessions clear their cooking drafts on the next refresh.
- The seed contains 40 ingredients and labelled sample history, with dates relative to the reset day.
