# Dish image comparison

Compares low, medium and high quality for the seed's Singapore-style laksa.
Each uses GPT Image 2.5 Flare, the same prompt, 1024 × 1024 and JPEG compression 100.

Requirements: Python 3.10+, `openai`, `python-dotenv`, and the bundled Codex imagegen CLI.
The API key comes from `source-code/.env.local`, the root `.env`, or `OPENAI_API_KEY`, in that order.
Use `--env-file` or `--cli` to select other paths.

From the repository root:

```powershell
python system-documentation/feasibility/image-generation/compare.py
python system-documentation/feasibility/image-generation/compare.py --run
```

The first command previews the request. `--run` makes three paid requests.
Each run saves images, `comparison.html` and `results.json` under
`output/imagegen/laksa-<run>/`. Open the HTML to compare images at card size or full size.

Results include API completion time, other local overhead, returned usage,
request IDs and estimated USD cost. Each quality has one sample. Network latency,
server load and random image composition affect the comparison. Automatic retries
are disabled; the run stops on the first error.

The key needs image-generation write permission. A scope error naming
`api.model.images.request` requires updating that key's permissions in the OpenAI platform.
