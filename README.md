# sc3040-adv-swe

## Project files

- `meeting-minutes/`: meeting records.
- `source-code/`: code and experiments.
- `system-documentation/`: findings and submission exports.
- `sprint-backlogs/`: GitHub Projects exports.

These match the lab's four folder categories. Working documents remain in Google Docs.
See the [feasibility check](source-code/feasibility/README.md). Keep keys in the ignored `.env`.

## App

See [UseEatNow setup](source-code/app/README.md) for the local app and Supabase.
The app README is the setup reference; cloud-only commands live in
[deployment notes](system-documentation/deployment.md).

## Contributing

- Branch: `<name>/<type>-<short-description>`
- PR title and commit subject: `<type>: <short description>`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Before an app PR: run `pnpm check` from `source-code/app`.
