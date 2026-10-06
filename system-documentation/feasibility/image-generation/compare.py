"""Compare three quality settings through the bundled image-generation CLI."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from html import escape
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time
from types import SimpleNamespace


REPO = Path(__file__).resolve().parents[3]
MODEL = "gpt-image-2.5-flare"
SIZE = "1024x1024"
QUALITIES = ("low", "medium", "high")
PROMPT = """Photorealistic food photograph for a meal recommendation card.
A bowl of Singapore-style laksa with thick white rice noodles, curled pink prawns,
golden porous tofu puffs, pale bean sprouts and finely sliced green laksa leaves
in creamy orange coconut broth. Use only these visible ingredients.
Serve in a plain white ceramic bowl on a neutral wooden table.
Three-quarter overhead view, entire bowl visible with a small margin,
centered composition. Soft natural daylight, realistic food texture and natural colors.
No egg, cockles, extra garnishes, text, logos, watermarks, hands or cutlery."""
RATES = {"text_input": 5, "image_input": 8, "image_output": 30}


def usage_cost(usage: dict | None) -> float | None:
    if not usage or not isinstance(usage.get("output_tokens"), int):
        return None
    inputs = usage.get("input_tokens_details") or {}
    # Text-only generation has no reference-image input.
    text_tokens = inputs.get("text_tokens", usage.get("input_tokens"))
    if not isinstance(text_tokens, int):
        return None
    image_tokens = inputs.get("image_tokens", 0)
    return round(
        (text_tokens * RATES["text_input"]
         + image_tokens * RATES["image_input"]
         + usage["output_tokens"] * RATES["image_output"]) / 1_000_000,
        8,
    )


def report_html(results: dict) -> str:
    cards = []
    for item in results["runs"]:
        quality = escape(item["quality"].capitalize())
        if item.get("error"):
            cards.append(f"<section><h2>{quality}</h2><p>{escape(item['error'])}</p></section>")
            continue
        image = escape(item["image"])
        seconds = item["request_seconds"]
        cost = item["estimated_cost_usd"]
        price = f"US${cost:.5f}" if cost is not None else "Usage unavailable"
        cards.append(f"""<section>
<header><h2>{quality}</h2><span>{seconds:.2f} s</span></header>
<a href="{image}" aria-label="Open {quality.lower()} quality image at full size">
<img src="{image}" width="1024" height="1024" alt="Singapore-style laksa, {quality.lower()} quality"></a>
<dl><div><dt>Estimated API cost</dt><dd>{price}</dd></div>
<div><dt>File size</dt><dd>{item['bytes'] / 1024:.0f} KB</dd></div></dl>
</section>""")
    return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laksa image quality comparison</title>
<style>
:root{color-scheme:dark;--bg:#0c0c0c;--text:#fafafa;--muted:#b8b8b8;--line:#363636;--focus:#ff8c1a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Segoe UI,sans-serif}
main{max-width:1500px;margin:auto;padding:clamp(16px,3vw,40px)}h1{font-size:clamp(26px,3vw,40px);line-height:1.2;margin:0 0 12px}
p{max-width:75ch;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:32px 0}
section{min-width:0}header{display:flex;align-items:baseline;justify-content:space-between;gap:16px}h2{font-size:20px;margin:0 0 12px}
header span{font-variant-numeric:tabular-nums;color:var(--muted)}a{display:block;color:var(--text);border-radius:16px}
a:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:4px}img{display:block;width:100%;height:auto;border-radius:16px}
dl{margin:16px 0}dl div{display:flex;justify-content:space-between;gap:16px;margin-top:6px}dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums}
details{border-top:1px solid var(--line);padding-top:16px}summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
pre{white-space:pre-wrap;font:inherit;max-width:75ch;color:var(--muted)}@media(max-width:750px){.grid{grid-template-columns:1fr;gap:28px}}
</style><main><h1>Singapore-style laksa</h1>
<p>Low, medium and high quality. Same prompt, GPT Image 2.5 Flare, 1024 × 1024, JPEG at compression 100. Click an image for full size.</p>
<div class="grid">""" + "".join(cards) + """</div>
<p>One sequential request per quality. Request timings include API generation and network transfer. Other local overhead includes setup, decoding and saving. Image content varies between generations. Costs use returned token usage and standard USD rates.</p>
<details><summary>Sample recipe and prompt</summary><p>Seed meal: Singapore-style laksa. Thick rice noodles, prawns, tofu puffs, bean sprouts, laksa paste, coconut milk and laksa leaves.</p><pre>""" + escape(PROMPT) + "</pre></details></main></html>"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Make three paid API requests")
    parser.add_argument("--env-file", type=Path, help="Select an env file instead of the project defaults")
    parser.add_argument("--cli", type=Path, default=Path.home() / ".codex/skills/.system/imagegen/scripts/image_gen.py")
    args = parser.parse_args()
    if not args.run:
        print(json.dumps({"model": MODEL, "size": SIZE, "qualities": QUALITIES, "prompt": PROMPT, "calls": 3}, indent=2))
        print("Add --run to make three paid requests.")
        return 0

    from dotenv import dotenv_values

    candidates = [args.env_file] if args.env_file else [REPO / "source-code/.env.local", REPO / ".env"]
    key = None
    for candidate in candidates:
        if candidate.is_file():
            key = dotenv_values(candidate).get("OPENAI_API_KEY")
            if key:
                break
    key = key or os.environ.get("OPENAI_API_KEY")
    if not key:
        parser.error("Set OPENAI_API_KEY in the selected env file or environment.")
    if not args.cli.is_file():
        parser.error("Set --cli to the bundled imagegen scripts/image_gen.py path.")

    spec = importlib.util.spec_from_file_location("bundled_image_generation", args.cli)
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    factory = cli._create_client
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    output = REPO / "output/imagegen" / f"laksa-{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    results = {
        "created_at": stamp, "model": MODEL, "size": SIZE,
        "output_format": "jpeg", "output_compression": 100,
        "prompt": PROMPT, "recipe_source": "source-code/src/domain/demo-data.ts",
        "method": "One sequential request per quality, SDK retries disabled, no reference images or partial previews.",
        "rates_usd_per_million": RATES,
        "pricing_source": "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare",
        "runs": [],
    }

    def save_report() -> None:
        (output / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        (output / "comparison.html").write_text(report_html(results), encoding="utf-8")

    for quality in QUALITIES:
        record = {"quality": quality}

        def measured_client():
            client = factory().with_options(api_key=key, base_url="https://api.openai.com/v1", max_retries=0, timeout=180)

            def generate(**payload):
                started = time.perf_counter()
                try:
                    response = client.images.generate(**payload)
                    record["request_seconds"] = round(time.perf_counter() - started, 3)
                    usage = getattr(response, "usage", None)
                    record["usage"] = usage.model_dump() if hasattr(usage, "model_dump") else usage
                    record["request_id"] = getattr(response, "_request_id", None)
                    record["returned_quality"] = getattr(response, "quality", None)
                    record["returned_size"] = getattr(response, "size", None)
                    record["estimated_cost_usd"] = usage_cost(record["usage"])
                    return response
                finally:
                    client.close()

            return SimpleNamespace(images=SimpleNamespace(generate=generate))

        cli._create_client = measured_client
        filename = f"laksa-{quality}.jpeg"
        original_argv = sys.argv
        original_key = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = key
        sys.argv = [str(args.cli), "generate", "--model", MODEL, "--quality", quality,
                    "--size", SIZE, "--n", "1", "--output-format", "jpeg",
                    "--output-compression", "100", "--no-augment", "--prompt", PROMPT,
                    "--out", str(output / filename)]
        started = time.perf_counter()
        try:
            print(f"Generating {quality} quality...", flush=True)
            cli.main()
            wall = time.perf_counter() - started
            record.update(image=filename, bytes=(output / filename).stat().st_size,
                          total_seconds=round(wall, 3),
                          local_overhead_seconds=round(wall - record["request_seconds"], 3))
        except Exception as error:
            message = str(error).replace(key, "[redacted]")
            record.update(error=re.sub(r"sk-[A-Za-z0-9_-]+", "[redacted]", message),
                          error_type=type(error).__name__,
                          total_seconds=round(time.perf_counter() - started, 3))
        finally:
            sys.argv = original_argv
            if original_key is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = original_key
        results["runs"].append(record)
        save_report()
        if record.get("error"):
            print(f"Stopped: {record['error']}", file=sys.stderr)
            print(f"Report: {output / 'comparison.html'}")
            return 1
        print(f"{quality}: {record['request_seconds']:.3f}s, estimated USD {record['estimated_cost_usd']}", flush=True)

    print(f"Report: {output / 'comparison.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
