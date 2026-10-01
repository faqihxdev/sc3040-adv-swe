# UseEatNow quick guide

Private demo: use the accounts shared by the team. Local accounts/setup are in
the [app README](../source-code/app/README.md). Local and hosted passwords differ.

| Task | Steps |
| --- | --- |
| UC1: Find meals | Cook → Find meals. Choose people, preferences and available staples; deselect anything absent. Next → inspect a recipe → Cook this. Selection does not change stock. |
| UC2: Inventory | Add ingredient → Manual or Photo. Enter/review name, stock band and required expiry date; preview, then confirm. Photo recognition is a draft, not a stock/date measurement. Edit/remove from each row; Activity & undo reverses your latest safe edit. |
| UC3: Finish cooking | Complete the steps → I've finished cooking. Mark used/discarded independently and set remaining stock. Preview → Confirm meal & stock. Untouched items retain stock. Ending a session saves no outcome. |
| UC4: Insights | View recorded meal/use/discard events and trends. View chart data exposes a table; Group by week uses Monday-start Singapore weeks. Unrecorded activity is excluded. |
| UC5: Access/preferences | Sign in; local signup/recovery are available outside private-demo mode. Household → Dietary exclusions → Save. Exclusions override preferences; check allergens yourself. |
| UC6: Household/account | Create or join with the owner's invite code. Owners can invite, remove or transfer ownership. A member can leave. Account controls appearance, sign out and typed account deletion; owners must first transfer ownership or delete the household. |

If a write conflicts, reload the current state and review again. Retry a failed
confirmation rather than creating another outcome. AI failures retain preferences;
Try again or Change preferences. Past-date/depleted items stay in records but
are excluded from recommendations. Stock bands and analytics are not quantities.

Account → Reset to seed is demo-only and allowlisted-owner-only. It replaces
household inventory/history, keeping accounts, members, preferences and AI usage.
Check real quantities and food safety before cooking; suggestions are not safety advice.
