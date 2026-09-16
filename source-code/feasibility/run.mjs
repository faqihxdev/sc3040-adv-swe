// Initial API experiment, not production meal-generation or food-safety code.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { release } from 'node:os';

// Deliberately fixed. Environment variables cannot select a stronger model.
export const MODEL = 'gpt-5.6-luna';
export const REASONING = 'medium';
const MAX_OUTPUT_TOKENS = 6000;
const TIMEOUT_MS = 60000;
const repo = new URL('../../', import.meta.url);
const string = { type: 'string', minLength: 1 };
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

export const schema = object({
  meals: {
    type: 'array', maxItems: 3,
    items: object({
      name: string,
      summary: string,
      servings: { type: 'integer', minimum: 1, maximum: 4 },
      cookingMinutes: { type: 'integer', minimum: 1, maximum: 30 },
      ingredients: {
        type: 'array', minItems: 1,
        items: object({ ingredientId: string, estimatedAmount: string }),
      },
      steps: { type: 'array', minItems: 4, maxItems: 6, items: string },
    }),
  },
  message: string,
});

export function schemaFor(input) {
  const requestSchema = structuredClone(schema);
  const excluded = new Set(input.excludedIngredientIds);
  const ids = [...new Set([
    ...input.inventory.filter(item => item.stockLevel !== 'Empty'),
    ...input.availableStaples,
  ].filter(item => !excluded.has(item.id)).map(item => item.id))];
  if (ids.length) {
    requestSchema.properties.meals.items.properties.ingredients.items.properties.ingredientId = {
      type: 'string', minLength: 1, enum: ids,
    };
  } else {
    requestSchema.properties.meals.maxItems = 0;
  }
  return requestSchema;
}

export const instructions = `Suggest three alternative single meals for one cooking session.
Return fewer, including none, if the available ingredients cannot support three suitable meals.
The user will choose ONE meal. Do not create a multi-day plan or a shopping list.
Use only the inventory and explicitly available staples. Empty stock is unavailable.
Respect dietaryExclusions, excludedIngredientIds and preferences. Do not invent ingredients,
including seasonings or garnishes. Every ingredient mentioned in prose must appear in the
meal's ingredient list with its exact supplied ID. Do not include excluded ingredients.
Each meal must use at least one usable inventory ingredient, take at most 30 minutes,
have 4 to 6 clear steps, and serve the requested number of people.
Stock levels are rough bands, not weights. Give practical estimated recipe amounts for
human review, but do not claim that a stock band proves a particular amount is available.
Do not infer expiry dates, freshness or food safety. Do not update inventory.
If no suitable meal is possible, return an empty meals array and explain why in message.
Keep all text concise. Return JSON matching the supplied schema.`;

// Checks only the JSON Schema keywords used above. No dependencies are needed.
export function checkShape(value, spec = schema, path = '$') {
  const errors = [];
  const fail = (detail) => errors.push(`${path}: ${detail}`);
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
    for (const key of spec.required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(spec.properties, key)) fail(`unexpected field ${key}`);
      else errors.push(...checkShape(value[key], spec.properties[key], `${path}.${key}`));
    }
  } else if (spec.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (value.length < (spec.minItems ?? 0) || value.length > (spec.maxItems ?? Infinity)) fail('wrong item count');
    value.forEach((item, i) => errors.push(...checkShape(item, spec.items, `${path}[${i}]`)));
  } else if (spec.type === 'string') {
    if (typeof value !== 'string' || value.trim().length < spec.minLength) fail('expected nonempty text');
    if (spec.enum && !spec.enum.includes(value)) fail('value outside allowed enum');
  } else if (spec.type === 'integer') {
    if (!Number.isInteger(value) || value < spec.minimum || value > spec.maximum) fail('integer outside allowed range');
  }
  return errors;
}

export function validate(output, scenario) {
  const errors = checkShape(output);
  if (errors.length) return errors;
  const { inventory, availableStaples, excludedIngredientIds, servings } = scenario.input;
  const excluded = new Set(excludedIngredientIds);
  const stock = new Set(inventory.filter(i => i.stockLevel !== 'Empty' && !excluded.has(i.id)).map(i => i.id));
  const allowed = new Set([...stock, ...availableStaples.filter(i => !excluded.has(i.id)).map(i => i.id)]);
  const names = new Set();
  for (const [index, meal] of output.meals.entries()) {
    const prefix = `meal ${index + 1}`;
    const name = meal.name.trim().toLowerCase();
    if (names.has(name)) errors.push(`${prefix}: duplicate meal name`);
    names.add(name);
    if (meal.servings !== servings) errors.push(`${prefix}: wrong servings`);
    const ids = meal.ingredients.map(i => i.ingredientId);
    if (new Set(ids).size !== ids.length) errors.push(`${prefix}: repeated ingredient ID`);
    if (!ids.some(id => stock.has(id))) errors.push(`${prefix}: no usable inventory ingredient`);
    for (const id of ids) if (!allowed.has(id)) errors.push(`${prefix}: unavailable or excluded ingredient ID ${id}`);
  }
  if (scenario.expectation === 'no-meals' && output.meals.length !== 0) errors.push('Expected no meals');
  if (scenario.expectation === 'one-to-three-meals' && output.meals.length === 0) errors.push('Expected at least one meal');
  return errors;
}

export function extractOutput(response) {
  if (response.status !== 'completed') throw new Error('Provider did not complete the response');
  const content = (response.output ?? []).flatMap(item => item.content ?? []);
  if (content.some(item => item.type === 'refusal')) throw new Error('Provider refused the request');
  const text = content.filter(item => item.type === 'output_text').map(item => item.text).join('');
  try { return JSON.parse(text); }
  catch { throw new Error('Provider returned missing or invalid JSON'); }
}

export async function main(args = process.argv.slice(2), fetchImpl = fetch) {
  if (args.length !== 1 || !['--preview', '--live'].includes(args[0])) {
    throw new Error('Use --preview for no network calls, or --live for three paid API requests');
  }
  const scenariosText = await readFile(new URL('scenarios.json', import.meta.url), 'utf8');
  const scenarios = JSON.parse(scenariosText);
  if (scenarios.length !== 3) throw new Error('This experiment is capped at three scenarios');
  if (args[0] === '--preview') {
    console.log(JSON.stringify({ mode: 'preview', model: MODEL, reasoning: REASONING, apiCalls: 0, scenarios }, null, 2));
    return;
  }
  // Read only the key. Do not load arbitrary .env options into process.env.
  let local = {};
  try { local = parseEnv(await readFile(new URL('.env', repo), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read the local .env file'); }
  const apiKey = (local.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Set OPENAI_API_KEY in the ignored repo-root .env file');

  const report = {
    startedAt: new Date().toISOString(), mode: 'live', model: MODEL, reasoning: REASONING,
    maxOutputTokensPerRequest: MAX_OUTPUT_TOKENS, timeoutMs: TIMEOUT_MS, automaticRetries: 0,
    environment: { node: process.version, platform: process.platform, release: release(), arch: process.arch },
    sourceSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    scenariosSha256: createHash('sha256').update(scenariosText).digest('hex'),
    instructions, baseSchema: schema, results: [],
    limitations: 'Structural and ingredient-ID checks only. Prose, recipe feasibility, quantities and dietary suitability need human review. Not an end-to-end, safety, load or acceptance test.',
  };
  const resultDir = new URL('system-documentation/feasibility/results/', repo);
  await mkdir(resultDir, { recursive: true });
  for (const scenario of scenarios) {
    const start = performance.now();
    const requestSchema = schemaFor(scenario.input);
    const result = { scenarioId: scenario.id, input: scenario.input, expectation: scenario.expectation, requestSchema };
    let stop = false;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, reasoning: { effort: REASONING }, store: false,
          max_output_tokens: MAX_OUTPUT_TOKENS, instructions,
          input: JSON.stringify(scenario.input),
          text: { format: { type: 'json_schema', name: 'meal_suggestions', strict: true, schema: requestSchema } },
        }),
      });
      result.httpStatus = response.status;
      if (!response.ok) {
        // Never log response error bodies, which may echo credentials or request text.
        stop = true;
        throw new Error(`HTTP ${response.status}; stopped without retry or model fallback`);
      }
      let data;
      try { data = await response.json(); }
      catch { stop = true; throw new Error('Invalid JSON response envelope'); }
      result.returnedModel = data.model;
      result.usage = data.usage;
      result.responseStatus = data.status;
      result.output = extractOutput(data);
      result.validationErrors = validate(result.output, scenario);
      result.status = result.validationErrors.length ? 'validation-failed' : 'automated-checks-passed';
      result.humanReview = 'pending';
    } catch (error) {
      result.status = 'error';
      // Known messages only; arbitrary network errors can contain sensitive values.
      const known = /^(HTTP \d{3};|Provider |Invalid JSON response envelope)/.test(error.message);
      result.error = known ? error.message : 'Network or request failure; no retry attempted';
      stop = true;
    }
    result.elapsedMs = Math.round(performance.now() - start);
    report.results.push(result);
    console.log(`${scenario.id}: ${result.status}, ${result.elapsedMs} ms`);
    if (stop) break;
  }
  report.finishedAt = new Date().toISOString();
  report.completedScenarios = report.results.length;
  const filename = `${report.startedAt.replace(/[:.]/g, '-')}.json`;
  const resultPath = new URL(filename, resultDir);
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`Results: ${fileURLToPath(resultPath)}`);
  if (report.results.length !== 3 || report.results.some(r => r.status !== 'automated-checks-passed')) process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
