# Meal-generation feasibility check

Archived September experiment, not the current app requirements.

Node.js 24+, no dependencies. Put `OPENAI_API_KEY` in the ignored root `.env`.
Run from the repository root:

```powershell
node system-documentation/feasibility/check/run.mjs --preview
node system-documentation/feasibility/check/run.mjs --live
```

Preview is offline. Live uses Luna medium, at most three requests and 6,000 output
tokens each, with no retries or model fallback. Cases cover ordinary stock, exclusions
and depleted stock. The schema restricts ingredient IDs; independent validation remains.

[Findings and raw data](../README.md).
Human recipe review is still required. This is not an end-to-end or acceptance test.
