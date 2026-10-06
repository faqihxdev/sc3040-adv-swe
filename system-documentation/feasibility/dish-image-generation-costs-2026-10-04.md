# Dish image generation costs

Pricing checked 4 October 2026.

OpenAI describes `gpt-image-2.5-flare` as its fast model for everyday image generation. Standard rates are $5 per million text input tokens, $8 per million image input tokens and $30 per million image output tokens. Prices below are USD. [Model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [pricing](https://developers.openai.com/api/docs/pricing)

The official calculator was set explicitly to GPT Image 2.5, width 1024 and height 1024. Its output estimates exclude inputs. The totals assume 200 text prompt tokens per image, adding $0.001, with no reference images or partial previews. [Calculator](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)

| Quality | Output tokens | Image output | Total per image | Three images |
| ------- | ------------: | -----------: | --------------: | -----------: |
| Low     |           196 |     $0.00588 |        $0.00688 |     $0.02064 |
| Medium  |           439 |     $0.01317 |        $0.01417 |     $0.04251 |
| High    |         1,756 |     $0.05268 |        $0.05368 |     $0.16104 |

At the recorded low-quality estimate, three images cost about US$0.021 before retries. These estimates exclude recipe generation, recognition, storage and delivery.

Selected configuration: low-quality Flare, 1024×1024 WebP. The app requests images concurrently, reuses a private 24-hour cache and allows one automatic retry per image for temporary failures. Recipe, recognition, image, retry and evaluation spending share the S$10 project ceiling. The figures above remain the dated experiment's estimates; use provider usage records for actual cost.

Actual token use can differ by model, prompt and settings. Responses API image generation also bills the main text model. Each streamed partial image adds 100 output tokens, or $0.003 at standard rates. Reusing saved images avoids regeneration; this differs from API prompt caching, which applies to the Responses image tool, not direct Images requests. [Cost guidance](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)

Free-tier access is unsupported; organization verification may be needed. Older `gpt-image-1-mini`, `gpt-image-1.5` and `chatgpt-image-latest` shut down on 1 December 2026. [Access](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [verification](https://developers.openai.com/api/docs/guides/image-generation), [deprecations](https://developers.openai.com/api/docs/deprecations)
