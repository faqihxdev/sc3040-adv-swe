# Feasibility results

16 September 2026. Luna medium, Node.js 24.15.0, Windows x64. Three synthetic cases per run.

Archived [runner and scenarios](check/README.md). Current app code is in `source-code/`.

| Run and raw data | Automated checks | Response times |
| --- | --- | --- |
| [Baseline](results/2026-09-16T13-14-45-743Z.json) | 2/3 passed | 3.6–11.3 s |
| [Restricted IDs](results/2026-09-16T13-18-54-999Z.json) | 3/3 passed | 2.8–7.8 s |

Baseline failure: `eggs` instead of ID `egg`. Restricting the schema to usable IDs
resolved it in this rerun. Independent validation remains; 23 offline checks passed.

Human recipe review remains necessary. This does not establish food safety, full SRS
acceptance or general latency.
