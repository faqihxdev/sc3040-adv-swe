# UseEatNow

Next.js, TypeScript, Tailwind/shadcn, Supabase and OpenAI. Dark by default;
saved theme preferences take precedence.

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
cd source-code
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

Local accounts: `alex@useeatnow.test` owns the shared household;
`sam@useeatnow.test` is a member; `jo@useeatnow.test` has a separate household.
Their local-only password is `UseEatNow!2026`.

### Daily startup and shutdown

From `source-code`, with the container engine running:

```sh
pnpm db:start
pnpm dev
```

Stop the app with Ctrl+C, then `pnpm db:stop` to stop Supabase while retaining data.
After pulling dependency/schema changes, repeat install, migrate and types from first setup.
Seeding is optional after first setup and preserves existing inventory.

The seed has 40 ingredients and synthetic history with relative dates.
Run `pnpm db:demo` after seeding, then restart the app to use demo-only login.
It enables Account → Reset to seed, which replaces demo inventory/history but retains accounts.
Set `DEMO_MODE=false` in `.env.local` and restart to test local signup/recovery.
If startup fails, check the Docker engine and competing services on ports 3000 or 54320 to 54324.

## Environment files

| Location                  | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `.env.example`            | Safe placeholders; allowed in Git.                                |
| `.env.local`              | Local Supabase keys, signing secret and runtime flags; generated. |
| `../.env`                 | Optional server-only `OPENAI_API_KEY` fallback.                   |
| `.env.hosted`             | Hosted Supabase/admin configuration; deployment operator only.    |
| `.demo-credentials.local` | Hosted demo passwords; share privately.                           |

Real credentials are ignored. Only the Supabase URL and anon key may use
`NEXT_PUBLIC_`; RLS controls database access. Keep AI/admin/signing keys server-side.
AI is off on a fresh setup. For real meal/photo requests, add `OPENAI_API_KEY` to
`.env.local` or repository-root `.env`, set `AI_ENABLED=true` in `.env.local`, and restart.
Those requests incur OpenAI API charges. Automated tests mock AI responses.
Models live in `src/server/recommendations.ts` and `photo-recognition.ts`.
`AI_REQUEST_LIMIT` caps request counts. Monitor OpenAI spending separately.

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

## Team workflow

Use `<name>/<type>-<description>` branches and `<type>: <description>` commits/PR titles.
Keep domain rules free of I/O; validate and authorise writes server-side.
Keep applied migrations unchanged; put schema changes in new migration files.
Then run `pnpm db:migrate` and `pnpm db:types` to update the database and generated types.

Run `pnpm check` before pushing: format, lint, types, unit/coverage and build.
With local Supabase running, use `pnpm test:db` for database changes and
`pnpm test:browser` for workflows/UI. SQL tests roll back; browser tests clean up
their fixtures, use port 3100 and mock AI responses.
Tests cover Chromium and Firefox at 360×800 and 1366×768. Chromium also emulates
mobile/touch behavior; Firefox uses a narrow viewport. Reports include browser/OS versions.
CI runs unit, database, browser and restore checks on app pushes and PRs.
CI uses local Supabase; the operator deploys separately. `pnpm format` skips secrets/generated output.
Local auth limits live in `supabase/config.toml`, including two emails/hour.
For heavier email testing, raise local `auth.rate_limit.email_sent`, then run
`pnpm db:stop` and `pnpm db:start`. Hosted settings are configured separately.
See [test plan and remaining acceptance](../system-documentation/testing.md)
and [user guide](../system-documentation/user-guide.md).

## Hosted demo

[Open demo](https://useeatnow-sg-demo.vercel.app) · private Alex/Sam accounts.
Vercel Hobby deploys manually; Supabase Free holds the shared demo database.
Only the deployment operator needs cloud credentials; teammates use local Supabase.
See [deployment commands](../system-documentation/deployment.md) and
[Vercel/Supabase free-tier limits](../system-documentation/deployment.md#free-tier-limits).
Hosted quotas apply to the shared deployment. Each developer's local stack runs independently.
Physical camera capture and email recovery still need device/acceptance checks.
