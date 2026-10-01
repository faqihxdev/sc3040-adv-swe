# sc3040-adv-swe

## Project files

- `meeting-minutes/`: meeting records.
- `source-code/`: app, database migrations and tests.
- `system-documentation/`: findings and submission exports.
- `sprint-backlogs/`: GitHub Projects exports.

Working documents remain in Google Docs.
See the [feasibility check](system-documentation/feasibility/README.md). Keep keys in the ignored `.env`.

## Local development

Start with [UseEatNow setup](source-code/README.md#local-development): prerequisites,
first-run commands, daily startup and local demo logins. Run commands from `source-code/`.
Development uses local Supabase. Hosting commands and
[free-tier limits](system-documentation/deployment.md#free-tier-limits) are in the deployment notes.

## Contributing

- Branch: `<name>/<type>-<short-description>`
- PR title and commit subject: `<type>: <short description>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Before an app PR: run `pnpm check`, `pnpm test:db` and `pnpm test:browser:smoke` from `source-code` with local Supabase running.
