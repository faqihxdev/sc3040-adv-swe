# Test plan and requirements coverage

Baseline: [current SRS](https://docs.google.com/document/d/1LWbJvVtaW_9C6HRl_6uyKmaQoQkqZhZctSjvV1MEotk/edit),
[SQAP v1.0](https://docs.google.com/document/d/1wqew1x-gv-KgmVl2rgC-CjaPcVROooq9/edit),
the quantity/Insights requirements in [#63](https://github.com/faqihxdev/sc3040-adv-swe/issues/63),
and cooking reservations in [#75](https://github.com/faqihxdev/sc3040-adv-swe/pull/75).
This executable test plan covers the current implementation. Retain the required
test plan, coverage and evidence with the Lab 5 submission.

Mapped requirements still require reviewer acceptance.

## Approach and release criteria

- Unit: independent expected values, date boundaries, scoring, analytics, schemas and signatures.
- Integration: real Supabase RLS/RPC operations; rollback, stale writes, retries and isolation.
- System: UC1 to UC6, errors and keyboard navigation on Chromium and Firefox at 360×800 and 1366×768.
- AI is mocked at its external boundary. Browser fixtures create/delete only their own local accounts; SQL fixtures roll back. Hosted data and paid AI are excluded.
- Pass: all automated assertions pass; retain failures and fixes. Suspend database tests if the target is not local or migrations/fixtures fail. Resume after correcting the environment and rerunning affected suites.
- Release acceptance additionally requires the manual checks below, zero open Critical/High defects and non-author review. JJ owns live AI evaluation; authors run automated checks and reviewers inspect evidence.

## Execution and evidence

Follow [Run and view tests](../source-code/README.md#run-and-view-tests) for setup,
execution, HTML viewers and CI artifact downloads. Commands run from `source-code`.

| Command                    | Evidence / scope                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`               | Format, lint, types, unit results in `reports/unit.xml`, coverage in `coverage/lcov-report/index.html`, production build. Coverage measures domain rules and meal tickets. |
| `pnpm test:db`             | `reports/database.txt`; five transactional SQL suites.                                                                                                                     |
| `pnpm test:browser:smoke`  | Six tagged core workflows on Chromium mobile/desktop; browser XML, HTML and environment reports.                                                                           |
| `pnpm test:browser`        | `reports/browser.xml`, `reports/browser-*.json`, `playwright-report/index.html`; isolated app at port 3100 with mocked AI.                                                 |
| `pnpm db:restore:practice` | `reports/restore.json`; separate local restore and row/RLS checks.                                                                                                         |

Recorded results and pending review are indexed in [GitHub #49](https://github.com/faqihxdev/sc3040-adv-swe/issues/49).

The [20 October release run](https://github.com/faqihxdev/sc3040-adv-swe/actions/runs/39360777335)
passed 218 unit tests, five SQL suites and 184 browser cases, 92 each on Chromium
and Firefox. Both browser jobs passed local restore practice. The tested commit
`e089cdc` has the same tree as merged and deployed `72722f4`.

- PRs and pushes to `main` run fast checks, SQL and the Chromium smoke suite once per event. Smoke covers public entry, inventory CRUD/undo, photo review, cooking/analytics, household rejoining and API protection.
- Manually select `suite: release` in App checks before production deployment. Both browser jobs must pass; each runs its mobile/desktop matrix, SQL and restore practice on a separate local Supabase.
- Archive `unit-coverage`, `local-release-chromium` and `local-release-firefox` from the same run. Release manifests identify the source commit and evidence hashes. Deployment remains manual.
- Failures include browser screenshots/traces.
- Archive acceptance reports with the source commit for one year. CI artifacts expire after 14 days.
- Reports, credentials and database dumps are ignored by Git.
- Record defect severity, reproduction, expected/actual result and retest evidence in an issue.

## Test cases

Executable cases contain their inputs, steps and assertions in `source-code/tests`.

| Case group                                                                  | Input / action → expected result                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meals.test.ts`, `staples.test.ts`                                          | Past/today/3/4/7/8-day dates, empty stock, exclusions and ties → exact eligibility, points and order; selected staples add no points.                              |
| `analytics.test.ts`                                                         | Positive quantity events, renamed snapshots and Singapore midnight/Monday → counts, unit-separated totals and ingredient waste shares.                             |
| `meal-token.test.ts`, `recommendations.test.ts`                             | Forged/expired/wrong-user tickets, bad AI IDs/schema, unavailable provider or active cooldown → rejection, bounded retry and no unauthorised writes.               |
| `photo*.test.ts`, `state.test.ts`, `demo-reset.test.ts`                     | Invalid uploads, unavailable AI, paging limits and reset scope → validation, bounded data and permission checks.                                                   |
| `core-database.sql`                                                         | CRUD/undo, foreign household, stale/duplicate confirmation, transfer/leave/delete → isolated, atomic, version-checked and idempotent operations.                   |
| `cooking-reservations.sql`, `reservations.test.ts`, `cooking-route.test.ts` | Atomic portion reservations, expiry/renewal, actual-use reconciliation, protected edits/undo, membership cleanup, signed tickets and access checks.                |
| `photo-batch.sql`, `demo-reset.sql`                                         | Invalid/stale writes → rollback. Demo reset clears members' exclusions, preserves accounts/usage history and isolates other households.                            |
| `shared-updates.test.ts`, `browser/shared-updates.spec.ts`                  | Two-member updates → row highlight, quantity notice, reduced-motion support and quiet unchanged refreshes. Remote reset clears the open dietary editor.            |
| `browser/*.spec.ts`                                                         | UC1–UC6, manual/photo drafts, previews, cancellation, failure/retry, analytics, exclusions, access and account deletion → asserted UI plus real local saved state. |

### Quantity and image regressions

| Cases                                                                     | Checks                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `quantities.test.ts`, `meals.test.ts`                                     | Decimal boundaries, matching units, sufficient amounts and unmeasured-item exclusion.                                            |
| `expiry-insights.test.ts`                                                 | Saved expiry at 0/3/4 days, Singapore dates, invalid/missing snapshots and per-unit records.                                     |
| `meal-image.test.ts`, `meal-image-cache.sql`                              | Image claims, cache bounds, generation beyond 100 calls, legacy RPC compatibility, cooldown and permissions.                     |
| `browser/cooking-confirmation.spec.ts`                                    | Combined confirmation, per-ingredient waste, calculated left and safe refresh retry.                                             |
| `browser/cooking-reservations.spec.ts`                                    | Real two-member races, shared portions after restock, overuse rejection, expiry/reacquisition, reload recovery and cancellation. |
| `browser/cooking-experience.spec.ts`, `browser/quantity-insights.spec.ts` | Concurrent images, one automatic transient retry, usable recipe fallback and Insights interactions.                              |

Evidence archives retain the original failure and affected retest. For the
6 October run, `reports/release-2026-10-06/` holds the full browser report,
isolated retest, unit, SQL and restore results. A Windows worker exited before
one test started; the isolated test passed three subsequent runs. Keep both
results when reviewing the release.

### Reservation acceptance cases

| Case      | SRS requirements           | Action and expected result                                                                                                                                     | Executable evidence                                                                        |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TC-RES-01 | FR-03; PR-04               | Two 100 g claims against 150 g: one succeeds, one conflicts; no partial holds. After restocking, both can hold separate portions.                              | `cooking-reservations.sql`; `browser/cooking-reservations.spec.ts`                         |
| TC-RES-02 | FR-03; CON-03              | Reload restores the recipe; a repeated start creates no duplicate hold; renewal requires an active session.                                                    | `cooking-route.test.ts`; `browser/cooking-reservations.spec.ts`                            |
| TC-RES-03 | FR-06, FR-07; IR-04; PR-04 | Confirmation reconciles actual use/waste, releases unused holds, protects others' portions and remains idempotent. Stale writes save nothing.                  | `cooking-reservations.sql`; `browser/cooking-reservations.spec.ts`                         |
| TC-RES-04 | FR-07; PR-04               | Cancellation releases holds without deductions. Expired holds stop reducing availability; renewal fails and reacquisition rechecks stock.                      | `reservations.test.ts`; `cooking-reservations.sql`; `browser/cooking-reservations.spec.ts` |
| TC-RES-05 | FR-04, FR-05; PR-04        | Edit, discard, deletion and undo preserve held portions and item identity/unit. Restocking remains available.                                                  | `cooking-reservations.sql`                                                                 |
| TC-RES-06 | FR-07, FR-12, FR-13; PR-04 | Reset and membership removal, move or deletion release affected holds. Ownership transfer preserves sessions. Foreign-household and direct-client writes fail. | `cooking-reservations.sql`; `cooking-route.test.ts`                                        |

## SRS traceability

`A` = automated assertions; `I` = inspection; `M` = manual acceptance still needed.
Mixed methods mean **partial verification**, not full acceptance.

| Requirement IDs                     | Verification / remaining evidence                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-01, CON-02; IR-02; FR-04, FR-05 | A: meal/photo validation, inventory browser cases, core/batch SQL. I: complete field-length/calendar rules.                                                                                                 |
| CON-03; OR-01                       | A: saved-state/browser/API checks. M: two-device refresh and state/score explanation walkthrough.                                                                                                           |
| FR-01, FR-02, FR-03; IR-03          | A: quantity/unit eligibility, staples, recipe validation, atomic reservations, reload recovery, concurrent images and retry/cache checks. TC-RES-01/02. M: live recommendation suitability.                 |
| FR-06, FR-07; IR-04; PR-04; OR-02   | A: prefilled use/waste, stock left, hold protection, reconciliation, expiry/cancellation, atomic/idempotent/stale writes and membership cleanup. TC-RES-03 to TC-RES-06. M: complete two-device acceptance. |
| FR-08, FR-09; PR-05; OR-03          | A: analytics/expiry fixtures, preserved snapshots, untracked history, exact-unit drill-downs and chart-data tables. M: complete chart labels, keyboard/readability and reporting-limit walkthrough.         |
| FR-10                               | A: local signup, invalid login, recovery request, logout. M: email confirmation and complete recovery-link/password-change flow; hosted custom SMTP.                                                        |
| FR-11, FR-12, FR-13; IR-01; OP-03   | A: exclusions, join/leave/transfer, ownership restrictions, typed deletions, foreign-household RLS and API validation.                                                                                      |
| PR-01, PR-02                        | A: schema/ID/unit/amount/exclusion filters, bounded recipe retry and authorised image-cache operations. M: live prompt-injection and ingredient-alias scenarios.                                            |
| PR-03                               | A: hand-calculated points, denominator, zero-eligible case and unrounded tie-breaking.                                                                                                                      |
| PR-06                               | M: 20 live recipe-ready timings; at least 18 within 15 seconds. Record failures/retries and image completion separately.                                                                                    |
| OP-01, OP-04                        | A: failure preserves preferences, drafts and saved state. I/M: user guide, recovery instructions and walkthrough.                                                                                           |
| OP-02; DR-01                        | I: env ignore/redaction, lockfile, CLI/config/migrations/seed. A: clean build and local CI setup. M: fresh teammate setup/security review.                                                                  |
| OP-05                               | A: separate local restore/count/RLS drill. M: hosted backup, four-copy retention, restricted access, seven-day loss / one-working-day recovery objectives.                                                  |
| OP-06                               | A: actor/history snapshots and compensating undo in core SQL. I: displayed actor/time.                                                                                                                      |
| DR-02, DR-03                        | I/M: source/config/applied-migration baseline, live release smoke and compatible rollback; see deployment runbook.                                                                                          |

## Outstanding acceptance / course evidence

- Q-05: JJ's 10 live AI scenarios; at least 8 pass and zero hard violations.
- Q-06 / PR-06: 20 live submission-to-recipe-result timings, including failures/retries. Record image completion separately.
- Supplementary layout checks use Pixel 8 and Laptop L. Record each case's actual viewport, including overrides.
- Browser matrix: Chromium and Firefox at 360×800 and 1366×768, matching SRS §12.2. Record exact versions and OS in `reports/browser-*.json`. These are Playwright test builds. Chromium emulates mobile/touch; Firefox checks layout at that width only.
- SRS §5.1: `browser/load.spec.ts` checks six concurrent local state reads, two households, 50 items and 500 outcomes each; `reports/load-*.json` records timing and isolation. Hosted capacity, physical camera/file capture and complete email flows remain manual.
- The linked SQAP covers quantity integrity, image failure/retry and recipe-ready timing. Its traceability is maintained in [#33](https://github.com/faqihxdev/sc3040-adv-swe/issues/33).
- Lab 4 formal design/maintainability, configuration, change and release plans remain distinct deliverables; these short runbooks do not replace approved plans.
