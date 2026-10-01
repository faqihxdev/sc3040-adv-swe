# Hosted demo operations

[UseEatNow](https://useeatnow-sg-demo.vercel.app) uses Singapore hosting:

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

From `source-code`:

1. Authenticate the Supabase and Vercel CLIs; obtain private `.env.hosted`.
2. Link Vercel with `pnpm dlx vercel@61.0.0 link --project useeatnow-sg-demo --scope aqilakmal-project`.
3. Run the required database/configuration steps below. Review each dry run before applying changes.

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

## Initial setup / credentials

From `source-code`:

1. Run `node scripts/hosted.mjs create`, then `node scripts/hosted.mjs keys`. These reuse the named project and save credentials privately.
2. Link, migrate and configure as above.
3. Run `pnpm db:seed:hosted` to create Alex/Sam accounts while preserving existing inventory.
4. Run `node scripts/configure-demo-reset.mjs --hosted`, then `node scripts/hosted.mjs credentials` to save private logins.
5. Run `node scripts/vercel-env.mjs` to add initial production variables via stdin. It rejects existing names and reads the AI key from repository-root `.env`.

For rotated keys, update Vercel Production environment variables and redeploy.

For a changed domain, run `node scripts/hosted.mjs origin <new-https-origin>`.
Reapply hosted auth config and update Vercel `APP_ORIGIN` before redeploying.

## Demo safeguards

- Registration is disabled; passwords are in ignored `.demo-credentials.local`.
- Account → Reset to seed refreshes synthetic inventory/history with rolling dates. Only the allowlisted owner can reset; accounts, membership and AI usage survive.
- Monitor OpenAI spending separately from the request-count cap.
- Keep database backups; inactive Free projects can pause.
- Hosted signup/recovery needs custom SMTP.

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
