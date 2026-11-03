# Hosted demo operations

[UseEatNow](https://useeatnow.utf.sh) uses Singapore hosting:

- Vercel Hobby: `aqilakmal-project/useeatnow-sg-demo`.
- Supabase Free: `useeatnow-sg-demo`, ref `kskfjituisvwdnlcligy`.
- Cloud credentials stay with the deployment operator. Local development uses generated `.env.local` credentials.

## Free-tier limits

Verified 1 October 2026.

### Vercel Hobby

- Personal, non-commercial projects with one owner/developer seat. [Hobby](https://vercel.com/docs/plans/hobby), [seats](https://vercel.com/pricing).
- Monthly: 100 GB transfer, 1M function invocations, 4 CPU-hours and 360 GB-hours memory. [Quotas](https://vercel.com/docs/plans/hobby).
- Exceeding quotas can pause service; Hobby has no paid overage. [Plans](https://vercel.com/docs/plans).
- Private organization Git integration requires Pro. [Git restrictions](https://vercel.com/docs/git#deploying-private-git-repositories).

### Supabase Free

- Two active projects across organizations where you are Owner/Admin. [Project allowance](https://supabase.com/docs/guides/platform/billing-on-supabase).
- Database: 500 MB/project. Organization quotas: 1 GB Storage, 5 GB egress, 5 GB cached egress, 50,000 MAU. [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [pricing](https://supabase.com/pricing).
- Projects can pause after seven low-activity days. [Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- Backups require manual exports. [Backups](https://supabase.com/pricing).

### Auth and local testing

- Built-in email: two messages/hour/project, only to organization team addresses. [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits).
- Preseeded demo accounts use password sign-in, which has separate Auth rate limits. [Password auth](https://supabase.com/docs/guides/auth/passwords).
- Local Supabase runs independently of hosted quotas. [Local development](https://supabase.com/docs/guides/local-development).

## Existing deployment

From the application root:

1. Authenticate the Supabase and Vercel CLIs; obtain private `.env.hosted`.
2. Link Vercel with `pnpm dlx vercel@61.0.0 link --project useeatnow-sg-demo --scope aqilakmal-project`.
3. Complete the applicable [release checks](#release-checks) for the revision being deployed.
4. Run the required database/configuration steps below. Review each dry run before applying changes.

```sh
node scripts/hosted.mjs link
node scripts/hosted.mjs migration-check
node scripts/hosted.mjs migrate
node scripts/hosted.mjs config-check
node scripts/hosted.mjs configure
pnpm check
pnpm dlx vercel@61.0.0 deploy --prod --yes --scope aqilakmal-project
node scripts/verify-hosted.mjs
```

- Hosted auth uses `deployment/supabase/config.toml`; keep local configuration separate.
- Vercel uploads this working directory. `.vercelignore` excludes credentials, backups, reports and local/test tooling.
- The owner deploys production through the CLI. Deployment preserves existing demo data.
- The verifier checks landing/login, both accounts, shared access and reset permissions with read-only inventory checks.

## Quantity migration

The hosted demo includes `202610030001_quantities`, the three
`20261005000*` image-cache migrations and `202610060001_outcome_expiry`.
Use `migration-list` to verify the target before a release.

- Back up before applying migrations. Existing unmeasured items show Set amount.
- Enter real amounts and units, or use the demo owner's reset for fresh sample data.
- New confirmations save expiry snapshots. Older missing snapshots remain untracked.
- Apply pending migrations before the reservation-enabled app build. They add service-only cooking operations, stock protection and membership cleanup. The previous confirmation entry point remains compatible during rollout.
- Quantity confirmation contracts differ from the stock-band version. Check schema
  compatibility before restoring an older app deployment.

The demo is deployed. Formal acceptance, a reviewed release revision and verified
GitLab submission remain separate checks.

## Release record

### 3 November 2026

- Current production: [useeatnow.utf.sh](https://useeatnow.utf.sh), Vercel deployment
  `dpl_2522dpUAdxpT8GuxzFk3oMSzttHp`, built from `8246f3c`. Its tree matches
  merge commit `02511dc` from [PR #94](https://github.com/faqihxdev/sc3040-adv-swe/pull/94).
- [PR #93](https://github.com/faqihxdev/sc3040-adv-swe/pull/93) moved the application
  to the GitHub repository root, added the new landing page and consolidated guides
  in `docs/`. The GitLab course package still uses its `source-code/` wrapper.
- The [full release run](https://github.com/faqihxdev/sc3040-adv-swe/actions/runs/41562122934)
  passed on `e798f35`, whose tree matches the PR #93 merge `76aa1bd`: 218 unit tests,
  five SQL suites and 188 browser cases, 94 each on Chromium and Firefox. Both
  browser jobs passed local restore practice. Artifacts: `unit-coverage`,
  `local-release-chromium` and `local-release-firefox`.
- PR #94 subsequently centered the landing content and refined the README preview.
  `pnpm check` and eight focused layout/motion browser checks passed. Live checks at
  five viewport sizes confirmed the layout and sign-in navigation. These focused
  checks are separate from the 188-case full release run above.
- The canonical domain is `useeatnow.utf.sh`. The previous Vercel address and
  `useitnow.utf.sh` redirect to it. Database schema and existing household data were
  unchanged by these releases.

### 20 October 2026

- Released: 20 October 2026.
- Source: `72722f4`, [PR #75](https://github.com/faqihxdev/sc3040-adv-swe/pull/75).
- Vercel deployment: `dpl_YNs2UVpd1dU2JtbAHfnKksxu6jGx`, the production deployment
  for this release.
- Supabase migrations `202610200001_cooking_reservations.sql` and
  `202610200002_reservation_membership_updates.sql` are applied; the migration check is clean.
- A private pre-migration export retains roles, schema, data and migration history.
  The previous Vercel deployment remains available for compatible recovery.
- [Release checks](https://github.com/faqihxdev/sc3040-adv-swe/actions/runs/39360777335)
  passed on `e089cdc`, whose tree matches `72722f4`: 218 unit tests, five SQL
  suites and 184 browser cases, 92 each on Chromium and Firefox. Both browser
  jobs passed local restore practice. The artifacts are `unit-coverage`,
  `local-release-chromium` and `local-release-firefox`. See the
  [reservation cases](testing.md#reservation-acceptance-cases).
- Hosted checks passed for both logins, roles, atomic holds, shared visibility,
  restored sessions, renewal, repeat-start safety, stale rejection and cancellation.
  Recorded inventory and meal history were preserved. Saved demo recipes supplied
  the smoke test; no paid AI calls were needed.
- Successful confirmation is covered by the local SQL/browser release suites.
  Hosted confirmation, live AI quality/timing and other manual acceptance remain
  separate checks.

Use the linked tasks for report references: [configuration baseline](https://github.com/faqihxdev/sc3040-adv-swe/issues/47),
[verification](https://github.com/faqihxdev/sc3040-adv-swe/issues/51) and
[delivery](https://github.com/faqihxdev/sc3040-adv-swe/issues/52). Retain this record
with the delivered build; record each subsequent delivery separately.

## Release checks

Match verification to the change. Documentation and screenshot updates need formatting,
link and visual checks, with no application deployment. Layout-only changes need
`pnpm check`, focused browser checks at mobile and desktop sizes, and a live smoke check.
Changes to application behavior, authentication, APIs, database operations or dependencies
require the full release workflow below. Promoting an unchanged, tested build needs only
the live smoke check.

From the repository root:

```sh
gh workflow run app-checks.yml --ref main -f suite=release
gh run list --workflow app-checks.yml --event workflow_dispatch --branch main --limit 1
gh run watch RUN_ID --exit-status
```

Replace `RUN_ID` with the listed run. Confirm its commit matches the checkout being
deployed and that fast checks plus both browser jobs passed. Download all three
artifacts and retain them with the release commit. PR smoke checks provide quick
feedback; this full run is required for the functional changes listed above.

## Initial setup / credentials

From the application root:

1. Run `node scripts/hosted.mjs create`, then `node scripts/hosted.mjs keys`. These reuse the named project and save credentials privately.
2. Link, migrate and configure as above.
3. Run `pnpm db:seed:hosted` to create Alex/Sam accounts while preserving existing inventory.
4. Run `node scripts/configure-demo-reset.mjs --hosted`, then `node scripts/hosted.mjs credentials` to save private logins.
5. Run `node scripts/vercel-env.mjs` to add initial production variables via stdin. It rejects existing names and reads the AI key from repository-root `.env`.

For rotated keys, update Vercel Production environment variables and redeploy.

To change demo logins, set `DEMO_ALEX_PASSWORD` and `DEMO_SAM_PASSWORD` in
`.env.hosted`, using passwords of at least 8 characters. Run
`node scripts/demo-passwords.mjs --hosted`, then `node scripts/hosted.mjs credentials`.
The script verifies both logins and preserves app data. Password changes take effect
immediately; share the refreshed credentials privately.

For a changed domain, run `node scripts/hosted.mjs origin <new-https-origin>`.
Reapply hosted auth config and update Vercel `APP_ORIGIN` before redeploying.

### Custom domain

- Canonical URL: `https://useeatnow.utf.sh`.
- Cloudflare DNS: `useeatnow` CNAME to `bda3018598fedd2e.vercel-dns-017.com`, DNS only.
- The hostname belongs to the existing Vercel project; Vercel serves the app and HTTPS certificate.
- `APP_ORIGIN`, the Supabase site URL and auth callback URLs must use the same origin.
- The previous `useeatnow-sg-demo.vercel.app` and `useitnow.utf.sh` hostnames redirect to the canonical URL with HTTP 308, preserving paths and query strings.
- To apply an environment-only change, redeploy the existing production deployment;
  this preserves its application source. Run `node scripts/verify-hosted.mjs` afterward.

Before the landing-page releases on 3 November 2026, source `72722f4` was rebuilt as deployment
`dpl_GhzeYLJYdmKVqumsKZ35YB7BBK2b` with the custom origin. Hosted checks passed
HTTPS, both account roles, household isolation and request-origin checks without
inventory writes or AI calls.

## Demo safeguards

- Registration is disabled; passwords are in ignored `.demo-credentials.local`.
- Account → Reset to seed restores sample inventory/history with rolling dates and clears every member's dietary exclusions.
- Only the allowlisted owner can reset. Accounts, passwords, membership and AI usage are kept.
- Generation has no lifetime request cap. Recipe/photo requests share a 10-second per-user cooldown; image generation uses independent claims.
- Track all AI costs, including dish images and retries, against the S$10 project ceiling. Pause paid calls before exceeding it.
- Image-cache rows expire after 24 hours; the cache is private and capped at 100 rows and 64 MB.
- Keep database backups; inactive Free projects can pause.
- Hosted signup/recovery needs custom SMTP.

## Saved demo recipes

- Cook has a muted book icon at the bottom right on empty/error screens and after 30 seconds of generation. Hover or keyboard focus reveals **Use saved**; click or tap loads the recipes and cancels the pending live request.
- Prepared for Dinner for 2, mushrooms excluded, common staples selected, with bean sprouts preferred. The three recipes and illustrations load without paid AI calls.
- The server checks current quantities, expiry dates, exclusions and selected staples, then issues fresh cooking tickets. Confirmation and Insights use the normal workflow. Results show **Saved demo recipes** and retain that source in the meal record.
- Reset the demo before rehearsal for all three options. This fallback requires the app and database to be reachable.

The saved set comes from the second of three live GPT-6 Luna trials against the reset seed. Each trial returned three validated recipes in 20.8 to 21.1 seconds. Recipe data is in `src/server/demo-recipes.json`; prepared low-quality dish illustrations are in `public/demo-meals/`.

## Backup / recovery

- Back up the hosted database weekly and before migrations/demo.
- Retain four dated copies outside Git with team-restricted access.
- Targets: at most seven days' data loss; recovery within one working day.
- Record the source project, time, schema/data counts and checksum. Protect dumps like credentials.

Local practice (pause writes first):

```sh
pnpm db:backup
pnpm db:restore:practice
```

The drill restores a local backup into a new temporary database, compares row
fingerprints/counts/RLS, then removes that temporary target. Dumps stay in ignored `backups/`.

Validate hosted recovery, role recreation, SMTP/settings and recovery objectives separately.

For hosted recovery, follow the [Supabase procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore):

1. Export roles, schema, data and migration history. A default CLI dump is schema-only.
2. Verify auth/users, app rows, policies and migration history. Keep connection strings private.
3. Restore only to a separately approved empty project. Keep the shared demo database untouched during practice.
4. Reapply auth/app configuration; check both accounts, permissions, counts and a write/undo.

Database exports exclude external secrets/settings and Storage binaries. Photos are processed transiently.

## Release / rollback

After review and a clean commit, run `pnpm release:manifest`. Archive its commit,
lock/config/migration hashes and test evidence with the **applied** migration list
for the target (`node scripts/hosted.mjs migration-list`).

Retain the prior working Vercel deployment and database backup before release.

Deploy manually, then smoke-test login, inventory write/undo and one live meal
request/confirmation. Live AI smoke requires operator approval/budget.

Record live test results, defects and the released deployment URL/commit.

On failure:

1. Stop writes.
2. Restore the known-good deployment if compatible with the current schema. Otherwise use a reviewed forward migration or restore to a separate database and switch configuration.
3. Preserve shared data; review any migration reversal or reset explicitly.
4. Re-test access, writes and confirmation before resuming the demo.
