# UseEatNow

Next.js, TypeScript, Tailwind/shadcn, Supabase and OpenAI. Dark by default;
saved theme preferences take precedence.

## Local development

Requires Node 24.x, pnpm 11.1.1 and running Docker Desktop. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:migrate
pnpm db:types
pnpm db:seed
pnpm dev
```

`db:start` creates private `.env.local` credentials automatically. App:
[localhost:3000](http://127.0.0.1:3000); [DB Studio](http://127.0.0.1:54323);
[email inbox](http://127.0.0.1:54324). Docker ports stay localhost-only.
Stop the app with Ctrl+C; `pnpm db:stop` stops Supabase without deleting data.

Local accounts: `alex@useeatnow.test` owns the shared household;
`sam@useeatnow.test` is a member; `jo@useeatnow.test` has a separate household.
Their local-only password is `UseEatNow!2026`.

The seed contains 40 ingredients and synthetic history with relative dates.
Seeding preserves existing inventory. `pnpm db:demo` enables demo login and
Account → Reset to seed, which replaces inventory/history but retains accounts.
Set `DEMO_MODE=false` in `.env.local` to test signup/recovery.

## Environment files

| Location                  | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `.env.example`            | Safe placeholders; allowed in Git.                                |
| `.env.local`              | Local Supabase keys, signing secret and runtime flags; generated. |
| `../../.env`              | Optional server-only `OPENAI_API_KEY` fallback.                   |
| `.env.hosted`             | Hosted Supabase/admin configuration; deployment operator only.    |
| `.demo-credentials.local` | Hosted demo passwords; share privately.                           |

Real credentials are ignored. Only the Supabase URL and anon key may use
`NEXT_PUBLIC_`; RLS controls database access. Keep AI/admin/signing keys server-side.
AI is off locally until `AI_ENABLED=true`; restart after changing environment files.
Models live in `src/server/recommendations.ts` and `photo-recognition.ts`.
`AI_REQUEST_LIMIT` caps requests, not dollars.

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
Add a new migration rather than editing one already applied. Then run
`pnpm db:migrate` and `pnpm db:types`; do not hand-edit generated DB types.

Run `pnpm check` before pushing: format, lint, types, unit/coverage and build.
With local Supabase running, use `pnpm test:db` for database changes and
`pnpm test:browser` for workflows/UI. SQL tests roll back; browser tests clean up
their fixtures, use port 3100 and mock AI without a paid key.
Tests cover Chromium and Firefox at 360×800 and 1366×768. Firefox checks a narrow
viewport, not mobile emulation. Reports include browser/OS versions.
CI runs unit, database, browser and restore checks on app pushes and PRs.
It uses no cloud credentials and does not deploy. `pnpm format` skips secrets/generated output.
See [test plan and remaining acceptance](../../system-documentation/testing.md)
and [user guide](../../system-documentation/user-guide.md).

## Hosted demo

[Open demo](https://useeatnow-sg-demo.vercel.app) · private Alex/Sam accounts.
Vercel Hobby deploys manually; Supabase Free holds the shared demo database.
Only the deployment operator needs cloud credentials; teammates use local Supabase.
See [deployment commands and limits](../../system-documentation/deployment.md).
Physical camera capture and email recovery still need device/acceptance checks.
