# Test plan and requirements coverage

Baseline: [current SRS](https://docs.google.com/document/d/1LWbJvVtaW_9C6HRl_6uyKmaQoQkqZhZctSjvV1MEotk/edit),
[SQAP v1.0](https://docs.google.com/document/d/1wqew1x-gv-KgmVl2rgC-CjaPcVROooq9/edit),
reviewed 1 October 2026. This is the executable test plan; retain a reviewed
export with the Lab 5 submission. A mapped requirement is **not** automatically
an accepted requirement.

## Approach and release criteria

- Unit: independent expected values, date boundaries, scoring, analytics, schemas and signatures.
- Integration: real Supabase RLS/RPC operations; rollback, stale writes, retries and isolation.
- System: UC1 to UC6, errors and keyboard navigation on Chromium and Firefox at 360×800 and 1366×768.
- AI is mocked at its external boundary. Browser fixtures create/delete only their own local accounts; SQL fixtures roll back. Hosted data and paid AI are excluded.
- Pass: all automated assertions pass; retain failures and fixes. Suspend database tests if the target is not local or migrations/fixtures fail. Resume after correcting the environment and rerunning affected suites.
- Release acceptance additionally requires the manual checks below, zero open Critical/High defects and non-author review. JJ owns live AI evaluation; authors run automated checks and reviewers inspect evidence.

## Execution and evidence

From `source-code/app`, after `pnpm db:start` and `pnpm db:seed`:

| Command | Evidence / scope |
| --- | --- |
| `pnpm check` | Format, lint, types, unit tests with `reports/unit.xml`, `coverage/`, production build. Coverage measures domain rules and meal tickets, not the whole application. |
| `pnpm test:db` | `reports/database.txt`; three transactional SQL suites. |
| `pnpm test:browser` | `reports/browser.xml`, `reports/browser-*.json`, `playwright-report/`; isolated app at port 3100 with no AI key. |
| `pnpm db:restore:practice` | `reports/restore.json`; separate local restore and row/RLS checks. |

Dated local results and pending review are recorded in [GitHub #49](https://github.com/faqihxdev/sc3040-adv-swe/issues/49).

CI runs these checks without cloud secrets; deployment remains manual. Failures
include browser screenshots/traces. Archive acceptance reports with the source
commit for one year; CI downloads expire after 14 days. Reports, credentials
and database dumps are ignored by Git. Record defect severity, reproduction,
expected/actual result and retest evidence in an issue; do not equate green CI
with final acceptance.

## Test cases

Executable cases contain their inputs, steps and assertions in `source-code/app/tests`.

| Case group | Input / action → expected result |
| --- | --- |
| `meals.test.ts`, `staples.test.ts` | Past/today/3/4/7/8-day dates, empty stock, exclusions and ties → exact eligibility, points and order; selected staples add no points. |
| `analytics.test.ts` | Independent flags, renamed snapshots and Singapore midnight/Monday → event counts and correct grouping, never quantity estimates. |
| `meal-token.test.ts`, `recommendations.test.ts` | Forged/expired/wrong-user tickets, bad AI IDs/schema, unavailable provider/quota → rejection, bounded retry and no unauthorised writes. |
| `photo*.test.ts`, `state.test.ts`, `demo-reset.test.ts` | Invalid uploads, unavailable AI, paging limits and reset scope → validation, bounded data and permission checks. |
| `core-database.sql` | CRUD/undo, foreign household, stale/duplicate confirmation, transfer/leave/delete → isolated, atomic, version-checked and idempotent operations. |
| `photo-batch.sql`, `demo-reset.sql` | Invalid/duplicate/stale batches and non-owner reset → rollback, one save and retained accounts/quota. |
| `browser/*.spec.ts` | UC1–UC6, manual/photo drafts, previews, cancellation, failure/retry, analytics, exclusions, access and account deletion → asserted UI plus real local saved state. |

## SRS traceability

`A` = automated assertions; `I` = inspection; `M` = manual acceptance still needed.
Mixed methods mean **partial verification**, not full acceptance.

| Requirement IDs | Verification / remaining evidence |
| --- | --- |
| CON-01, CON-02; IR-02; FR-04, FR-05 | A: meal/photo validation, inventory browser cases, core/batch SQL. I: complete field-length/calendar rules. |
| CON-03; OR-01 | A: saved-state/browser/API checks. M: two-device refresh and state/score explanation walkthrough. |
| FR-01, FR-02, FR-03; IR-03 | A: eligibility, staples, recipe validation, no-write selection/cancellation; browser request capture. M: live recommendation suitability. |
| FR-06, FR-07; IR-04; PR-04; OR-02 | A: independent flags/defaults, preview, atomic/idempotent/stale writes and safe retries; core SQL/browser. M: stale-review UI walkthrough. |
| FR-08, FR-09; PR-05; OR-03 | A: independent analytics fixtures, empty state and chart-data table. M: complete chart labels, keyboard/readability and reporting-limit walkthrough. |
| FR-10 | A: local signup, invalid login, recovery request, logout. M: email confirmation and complete recovery-link/password-change flow; hosted custom SMTP. |
| FR-11, FR-12, FR-13; IR-01; OP-03 | A: exclusions, join/leave/transfer, ownership restrictions, typed deletions, foreign-household RLS and API validation. |
| PR-01, PR-02 | A: schema/ID/exclusion filters and one malformed-response retry. M: live prompt-injection and ingredient-alias scenarios. |
| PR-03 | A: hand-calculated points, denominator, zero-eligible case and unrounded tie-breaking. |
| PR-06 | M: 20 live runs; at least 18 below 15 seconds, including retries/failures. Mock timing is not evidence. |
| OP-01, OP-04 | A: failure preserves preferences, drafts and saved state. I/M: user guide, recovery instructions and walkthrough. |
| OP-02; DR-01 | I: env ignore/redaction, lockfile, CLI/config/migrations/seed. A: clean build and local CI setup. M: fresh teammate setup/security review. |
| OP-05 | A: separate local restore/count/RLS drill. M: hosted backup, four-copy retention, restricted access, seven-day loss / one-working-day recovery objectives. |
| OP-06 | A: actor/history snapshots and compensating undo in core SQL. I: displayed actor/time. |
| DR-02, DR-03 | I/M: source/config/applied-migration baseline, live release smoke and compatible rollback; see deployment runbook. |

## Outstanding acceptance / course evidence

- Q-05: JJ's 10 live AI scenarios; at least 8 pass and zero hard violations.
- Q-06 / PR-06: 20 live end-to-end timing runs. Keep these separate from automated mocks.
- Browser matrix: Chromium and Firefox at 360×800 and 1366×768, matching SRS §12.2. Record exact versions and OS in `reports/browser-*.json`. These are Playwright test builds. Chromium emulates mobile/touch; Firefox checks layout at that width only.
- SRS §5.1: `browser/load.spec.ts` checks six concurrent local state reads, two households, 50 items and 500 outcomes each; `reports/load-*.json` records timing and isolation. Hosted capacity, physical camera/file capture and complete email flows remain manual.
- Lab 4 formal design/maintainability, configuration, change and release plans remain distinct deliverables; these short runbooks do not replace approved plans.
