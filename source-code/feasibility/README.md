# Meal-generation feasibility check

Node.js 24+, no dependencies. Put `OPENAI_API_KEY` in the ignored root `.env`.
Run from the repository root:

```powershell
node source-code/feasibility/run.mjs --preview
node source-code/feasibility/run.mjs --live
```

Preview is offline. Live uses Luna medium, at most three requests and 6,000 output
tokens each, with no retries or model fallback. Cases cover ordinary stock, exclusions
and depleted stock. The schema restricts ingredient IDs; independent validation remains.

[Findings and raw data](../../system-documentation/feasibility/README.md).
Human recipe review is still required. This is not an end-to-end or acceptance test.
