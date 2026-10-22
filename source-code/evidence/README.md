# Presentation evidence checks

Run commands from `source-code`. These checks use local disposable fixtures and
do not reset the shared demo. The ordinary unit/browser suites are unchanged.

| Command                                                        | Purpose                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm exec vitest run -c evidence/calculations.config.mts`     | Four worked calculations and two real Auth sign-out configuration checks.         |
| `node evidence/restore-reservations.mjs`                       | Local separate-database restore with an active ingredient hold.                   |
| `node evidence/archive.mjs`                                    | Explicitly selected reports and hashes in an ignored preparation archive.         |
| `pnpm exec playwright test -c evidence/presentation.config.ts` | Visible reservation lifecycle, screenshots and video in separate report folders.  |
| `python evidence/readable-reports.py`                          | Searchable PDF tables from retained XML, JSON and SQL output. Requires ReportLab. |

## Paid live evaluation

The live runner requires an authorised API key in private configuration and local
Supabase. It creates and removes only its own test households/accounts. It runs
twenty requests and permits three low-quality images in the first trial.

PowerShell:

```powershell
$env:UEN_LIVE_EVIDENCE = 'approved'
pnpm exec playwright test -c evidence/live-ai.config.ts
```

Do not run it as part of routine regression. `UEN_LIVE_RESUME=true` retains
completed results and resumes missing trials only when the application source
and adapter hash match. Preserve the original reports before another run.

Raw data is in `reports/lab5-evidence/live-ai.json`. The live HTML/XML report is
under `evidence/reports/lab5-evidence`. Recorder interruptions and semantic
findings remain visible. `review.json` records the completed QA review by
See Toh Jin Jie, its confirmation and the unchanged nine-of-ten result.
Finding closure and final release acceptance remain separate.
`protocol.json` records the 45-second criterion.
The archive derives an assessment
without rewriting raw timings.

## Readable results and recording

The readable report retains test names, individual results, the four-browser
matrix, semantic scores, all twenty recipe timings and the active-hold restore.
The current timing assessment uses 45 seconds and includes no-recipe failures.
Raw record bytes and the semantic review's source checksum remain unchanged.

The presentation recorder runs one local Chromium test with disposable users,
real Supabase and a controlled recipe response. It records actual UI actions
and checks reservation, reload, resume and release. Its output is separate from
the 184-case browser baseline. The pointer ring marks actual pointer events.
Leading sign-in/setup may be trimmed for presentation, without changing action
order or speed. The recording is not a live-provider quality test.

The shared presentation guide contains the test plan, case IDs, requirement
map and Q&A index. Tasks #50, #51 and #52 record live evaluation, verification
and final release status. A preparation archive does not authorise deployment
or establish a clean, reviewed release baseline.

The archive builder writes outside the app, in repository `reports/lab5-evidence`.
Extract downloaded archives outside `source-code`; their reference copies of
TypeScript files are not a second runnable checkout.
