# Hosted demo operations

[UseEatNow](https://useeatnow-sg-demo.vercel.app): Vercel Hobby
`aqilakmal-project/useeatnow-sg-demo`; Supabase Free `useeatnow-sg-demo`
(`kskfjituisvwdnlcligy`). Both use Singapore. Cloud credentials stay with the
deployment operator; local development needs neither cloud account.

## Existing deployment

From `source-code`, authenticate the Supabase and Vercel CLIs. Obtain private
`.env.hosted` and link the existing project with
`pnpm dlx vercel@61.0.0 link --project useeatnow-sg-demo --scope aqilakmal-project`.
Never commit credentials. Run only the database/configuration steps needed:

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

Review each dry run before applying it. Hosted auth uses
`deployment/supabase/config.toml`, never the local config. Vercel uploads this
working directory; automatic GitHub deployment is not configured.
`.vercelignore` excludes credentials, backups, reports and local/test tooling.
The verifier checks landing/login, both accounts, shared access and reset permissions.
It does not call AI or alter inventory. Deployment does not reset existing demo data.

## Initial setup / credentials

`hosted.mjs create` reuses the named project; `keys` saves its keys privately.
Then link, migrate and configure as above. `pnpm db:seed:hosted` creates private
Alex/Sam accounts and preserves existing inventory. Run
`node scripts/configure-demo-reset.mjs --hosted`, then `hosted.mjs credentials`
to save private demo logins. `node scripts/vercel-env.mjs` adds initial Vercel
production variables via stdin and rejects existing names. It reads the AI key
from repository-root `.env`; `.env.hosted` does not need a duplicate AI key.

For rotated keys, update Vercel Production environment variables and redeploy.
For a changed domain, use `hosted.mjs origin <https://…vercel.app>`, reapply hosted
auth config, and update Vercel `APP_ORIGIN` before redeploying.

## Demo safeguards

Registration is disabled; passwords are in ignored `.demo-credentials.local`.
Account → Reset to seed refreshes synthetic inventory/history with rolling dates;
only the allowlisted owner can reset. Accounts, membership and AI usage survive.
The AI request cap is not a dollar spending guarantee. Keep database backups;
inactive Free projects can pause. Hosted signup/recovery needs custom SMTP.

## Backup / recovery

The operator backs up the hosted database weekly and before migrations/demo;
retain four dated copies outside Git with access restricted to the team. Aim for
at most seven days' data loss and recovery within one working day. Record the
source project, time, schema/data counts and checksum; protect dumps like credentials.

Local practice (pause writes first):

```sh
pnpm db:backup
pnpm db:restore:practice
```

The helper dumps the local database to ignored `backups/`, restores into a new
temporary database in the same cluster, compares data fingerprints/counts/RLS and removes only that
temporary target. It leaves the source untouched. This tests local recovery,
not hosted recovery, role recreation, SMTP/settings or the stated recovery objectives.

For hosted exports, use the official [Supabase backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore):
roles, schema **and data**, plus migration history. A default CLI dump is schema-only;
verify auth/users, app rows, policies and migration history are included. Keep
connection strings private. Restore only to a separately approved empty project,
reapply auth/app configuration, then check both accounts, permissions, counts
and a write/undo. Never practise against the demo database. Database exports do
not include external secrets/settings or Storage binaries; this app does not persist photos.

## Release / rollback

After review and a clean commit, run `pnpm release:manifest`. Archive its commit,
lock/config/migration hashes and test evidence with the **applied** migration list
for the target (`node scripts/hosted.mjs migration-list`); repository migration
files alone do not prove applied state.
Retain the prior working Vercel deployment and database backup before release.

Deploy manually, then smoke-test login, inventory write/undo and one live meal
request/confirmation. Live AI smoke requires operator approval/budget; mocks are
not release evidence. Record defects and the released deployment URL/commit.

On failure, stop writes. Revert to the known-good Vercel deployment only if its
code remains compatible with the current schema; otherwise use a reviewed
forward migration or restore to a separate database and switch configuration.
Never blindly reverse a migration or reset the shared database. Re-test access,
writes and confirmation before resuming the demo.
