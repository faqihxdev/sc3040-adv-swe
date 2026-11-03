# Development

Setup, code conventions and verification for UseEatNow. For the system overview,
see the [project README](../README.md).

## Repository and submission layout

This GitHub repository contains the application. Run commands from the directory
containing `package.json`, which is the GitHub repository root.

GitLab holds the course documents, meeting minutes and backlogs. Copy this
repository's application files into GitLab's `source-code/` directory for delivery.
Within that copy, run commands from `source-code/`. Exclude `.git/`, private environment files,
dependencies, build output and database backups out of the submission.

## Local development

Each developer runs a separate Supabase database, Auth service and Studio locally.

### Prerequisites

- Git and Node.js 24.x, matching `package.json`.
- pnpm 11.1.1: `npm install --global pnpm@11.1.1`.
- Docker CLI and a running local Docker engine with Linux containers.

Install [Docker Engine on Linux](https://docs.docker.com/engine/install/) or
[Docker Desktop on Windows/macOS](https://docs.docker.com/desktop/).
The setup scripts connect through a local Unix socket or Windows named pipe.

Check the tools before setup:

```sh
node --version
pnpm --version
docker info --format '{{.OSType}}'
```

Expect `v24.x`, `11.1.1` and `linux`. Start the container engine if `docker info` fails.
`pnpm install` includes the pinned Supabase CLI. Configuration is in `supabase/config.toml`.

### First setup

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:start    # Start local Supabase and generate private .env.local.
pnpm db:migrate  # Apply database migrations.
pnpm db:types    # Regenerate TypeScript database types.
pnpm db:seed     # Create local demo accounts and sample data.
pnpm dev        # Start the app with hot reload.
```

The first database start downloads container images and can take several minutes.
`db:start` writes the app's local Supabase credentials to `.env.local`.
Use these local services:

- [App](http://127.0.0.1:3000).
- [Supabase Studio](http://127.0.0.1:54323) for tables, SQL and auth users.
- [Test email inbox](http://127.0.0.1:54324) captures local Auth messages.

Ports stay localhost-only. Local data survives stopping and restarting the services.

Fresh local accounts use `UseEatNow!2026` unless private overrides are supplied:

- `alex@useeatnow.test`: shared household owner.
- `sam@useeatnow.test`: shared household member.
- `jo@useeatnow.test`: separate household.

For team credentials, set `DEMO_ALEX_PASSWORD`, `DEMO_SAM_PASSWORD` and
`DEMO_JO_PASSWORD` in `.env.local` before seeding. To update existing local accounts,
run `node scripts/demo-passwords.mjs`. This preserves inventory and history.

### Daily startup and shutdown

From the application root, with the container engine running:

```sh
pnpm db:start
pnpm dev
```

Stop the app with Ctrl+C, then `pnpm db:stop` to stop Supabase while retaining data.
After pulling dependency/schema changes, repeat install, migrate and types from first setup.
Seeding is optional after first setup and preserves existing inventory.

The seed has 40 ingredients and synthetic history with relative dates.
Older unmeasured inventory shows Set amount after migration. Enter an amount
and unit before including those items in meal requests.

- Demo mode: run `pnpm db:demo` after seeding and restart the app. Account → Reset
  to seed replaces demo inventory/history while retaining accounts.
- Signup/recovery: set `DEMO_MODE=false` in `.env.local` and restart.
- Startup failure: check Docker and competing services on ports 3000 or 54320 to 54324.

## Environment files

| Location                  | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `.env.example`            | Safe placeholders; allowed in Git.                                |
| `.env.local`              | Local Supabase keys, signing secret and runtime flags; generated. |
| `.env`                    | Optional server-only `OPENAI_API_KEY` fallback.                   |
| `.env.hosted`             | Hosted Supabase/admin configuration; deployment operator only.    |
| `.demo-credentials.local` | Private demo logins; share with the team.                         |

Real credentials are ignored. Only the Supabase URL and anon key may use
`NEXT_PUBLIC_`; RLS controls database access. Keep AI/admin/signing keys server-side.

AI is off on a fresh setup. For real meal/photo requests, add `OPENAI_API_KEY` to
`.env.local` or repository-root `.env`, set `AI_ENABLED=true` in `.env.local`, and restart.

Those requests incur OpenAI API charges. Automated tests mock AI responses.
Models live in `src/server/recommendations.ts`, `photo-recognition.ts` and
`meal-images.ts`. The project key needs recipe, vision and image-generation access.

Dish illustrations use low quality, load concurrently and retry temporary failure
once per image. The private cache expires after 24 hours and has row/byte limits.

Recipe and photo requests share a 10-second cooldown per user. Dish images run
concurrently. Usage history tracks requests and tokens; generation has no lifetime
request cap. Track all AI costs against the S$10 project ceiling and pause paid
calls before exceeding it; budget increases require team approval.

## Cooking reservations

`Cook this` reserves recipe portions atomically. Recorded stock stays unchanged;
available stock excludes active reservations. Each member has one cooking session,
restored after reload. Other members can cook with the remaining portions.

Confirmation records actual use and waste, then releases unused portions. Extra
use must fit stock left after other members' reservations. End session releases all
portions. Reservations last two hours and renew each minute while the app is visible.
Reset, leaving, member removal and account deletion release affected reservations.
Stock edits, discard, deletion and undo must preserve reserved portions.

## Where code lives

| Path                              | Responsibility                                               |
| --------------------------------- | ------------------------------------------------------------ |
| `src/app`                         | Routes, API boundaries and global styles.                    |
| `src/components`                  | Screens; `ui/` contains shared controls.                     |
| `src/domain`                      | Pure rules, schemas and canonical demo data.                 |
| `src/server`                      | Authenticated services, AI and recipe signing.               |
| `src/lib`                         | Supabase clients, generated DB types and utilities.          |
| `supabase/migrations`             | Database schema, RLS and atomic operations.                  |
| `supabase/config.toml`            | Local auth/database settings.                                |
| `deployment/supabase/config.toml` | Separate hosted auth settings.                               |
| `scripts` / `tests`               | Setup/deployment helpers; unit/SQL tests and photo fixtures. |

## Contributing

Use `<name>/<type>-<description>` branches and `<type>: <description>` commits/PR titles.
Keep domain rules free of I/O; validate and authorise writes server-side.
Keep applied migrations unchanged; put schema changes in new migration files.
Then run `pnpm db:migrate` and `pnpm db:types` to update the database and generated types.

Before pushing, follow [Run and view tests](#run-and-view-tests).
`pnpm format` skips secrets/generated output.

Local auth limits live in `supabase/config.toml`, including two emails/hour.
For heavier email testing, raise local `auth.rate_limit.email_sent`, then run
`pnpm db:stop` and `pnpm db:start`. Hosted settings are configured separately.

See [test plan and remaining acceptance](testing.md)
and [user guide](user-guide.md).

## Run and view tests

Complete [local setup](#local-development). Stop the dev server before `pnpm check`.
From the application root:

```sh
pnpm exec playwright install --with-deps chromium firefox # First run or Playwright update.
pnpm db:start
pnpm db:seed            # First run.
pnpm check              # Format, lint, types, unit tests, coverage and build.
pnpm test:db            # Transactional SQL tests.
pnpm test:browser:smoke # Critical flows on Chromium mobile/desktop.
```

SQL tests roll back. Browser tests start an isolated app on port 3100, clean up
fixtures and mock AI responses.

Before release, run `pnpm test:browser` for the full Chromium/Firefox matrix at
360×800 and 1366×768. Chromium emulates mobile/touch; Firefox uses a narrow viewport.
Some feature checks also use Pixel 8 and Laptop L dimensions. Record actual case
viewports with the evidence.

For recovery checks, pause local writes, then run `pnpm db:restore:practice`.

| Report                         | How to view it                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Browser results                | Run `pnpm exec playwright show-report playwright-report`, then visit [localhost:9323](http://127.0.0.1:9323). |
| Coverage                       | Open `coverage/lcov-report/index.html` in a browser.                                                          |
| Unit results                   | Open `reports/unit.xml` in an editor.                                                                         |
| SQL / restore                  | Open `reports/database.txt` / `reports/restore.json` in an editor.                                            |
| Browser versions / read timing | Open `reports/browser-*.json` / `reports/load-*.json` in an editor.                                           |

Coverage measures `src/domain` and `src/server/meal-token.ts`.

CI runs fast checks, SQL and Chromium smoke tests on PRs and pushes to `main`.
Full release checks run through Actions → App checks → Run workflow → `suite: release`.
Chromium and Firefox run in separate jobs with one worker and local database each.

1. Open GitHub → Actions → App checks → run → Artifacts.
2. Download and extract `unit-coverage` for coverage/unit results or
   `local-smoke` for PR browser/SQL results. Release runs provide
   `local-release-chromium` and `local-release-firefox`, including restore evidence.
3. Open the extracted coverage HTML. From the application root, run
   `pnpm exec playwright show-report "PATH_TO_REPORT"` with the extracted `playwright-report` folder.

Artifacts expire after 14 days. Archive accepted release reports with their commit ID.

## Hosted demo

[Open demo](https://useitnow.utf.sh) · private Alex/Sam accounts.
Vercel Hobby deploys manually; Supabase Free holds the shared demo database.
Only the deployment operator needs cloud credentials; teammates use local Supabase.

See [deployment commands](deployment.md) and
[Vercel/Supabase free-tier limits](deployment.md#free-tier-limits).

Hosted quotas apply to the shared deployment. Each developer's local stack runs independently.
Physical camera capture and email recovery still need device/acceptance checks.
