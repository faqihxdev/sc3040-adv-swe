import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { AppState } from '@/domain/model';
import {
  buildMealImagePrompt,
  MEAL_IMAGE_MODEL,
  MEAL_IMAGE_QUALITY,
  MEAL_IMAGE_SIZE,
} from '@/domain/meal-image';
import type { Recipe } from '@/domain/model';
import { adminDb } from '@/lib/supabase/server';
import { databaseError } from './http';
import { AppError } from './errors';

type Ticket = {
  id: string;
  recipe: Recipe;
  trackedIds: string[];
  ingredientNames?: Record<string, string>;
};
type CacheReply = { status: 'ready' | 'claimed' | 'pending'; image?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code: string; message: string } | null }>;
};

function keyFor(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function dataUrl(base64: string, mediaType: string | undefined) {
  if (base64.startsWith('data:')) return base64;
  const type =
    mediaType === 'image/webp' || mediaType === 'image/png' || mediaType === 'image/jpeg'
      ? mediaType
      : 'image/webp';
  return `data:${type};base64,${base64}`;
}

async function encodeDisplayImage(image: {
  base64: string;
  mediaType?: string;
  uint8Array?: Uint8Array;
}) {
  const source = image.uint8Array ?? Buffer.from(image.base64, 'base64');
  if (source.byteLength > 8 * 1024 * 1024)
    throw new AppError('The generated image was too large.', 502);
  const encoded = await sharp(source, { limitInputPixels: 4096 * 4096 })
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  return dataUrl(encoded.toString('base64'), 'image/webp');
}

function allowedIngredientNames(state: AppState, ticket: Ticket) {
  const byId = new Map(
    state.items.filter((item) => !item.deleted).map((item) => [item.id, item.name]),
  );
  return ticket.recipe.ingredients
    .map(({ ingredientId }) => ticket.ingredientNames?.[ingredientId] ?? byId.get(ingredientId))
    .filter((name): name is string => Boolean(name));
}

async function rpc(db: RpcClient, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) databaseError(result.error);
  return result.data as CacheReply;
}

export async function createMealImage(
  state: AppState,
  token: string,
  ticket: Ticket,
  cancellation?: AbortSignal,
) {
  cancellation?.throwIfAborted();
  if (!state.household) throw new AppError('Join a household first.');
  if (process.env.AI_ENABLED !== 'true') throw new AppError('Live AI is switched off.', 503);
  if (!process.env.OPENAI_API_KEY) throw new AppError('The server has no AI key configured.', 503);
  const names = allowedIngredientNames(state, ticket);
  if (!names.length) throw new AppError('This meal has no current inventory ingredients.', 409);
  const db = adminDb() as unknown as RpcClient;
  const cacheKey = keyFor(token);
  const claim = await rpc(db, 'claim_meal_image', {
    cache_key: cacheKey,
    actor: state.user.id,
    household: state.household.id,
    session_id: ticket.id,
  });
  if (claim.status === 'ready' && claim.image) return { image: claim.image };
  if (claim.status === 'pending') throw new AppError('This image is already being prepared.', 409);

  let callId: unknown;
  try {
    cancellation?.throwIfAborted();
    const reservation = await db.rpc('reserve_meal_image', {
      actor: state.user.id,
      cache_key: cacheKey,
    });
    if (reservation.error) databaseError(reservation.error);
    callId = reservation.data;
    const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await generateImage({
      model: provider.image(MEAL_IMAGE_MODEL),
      prompt: buildMealImagePrompt(ticket.recipe, names),
      size: MEAL_IMAGE_SIZE,
      maxImagesPerCall: 1,
      maxRetries: 0,
      abortSignal: cancellation
        ? AbortSignal.any([cancellation, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
      providerOptions: { openai: { quality: MEAL_IMAGE_QUALITY, outputFormat: 'webp' } },
    });
    await db.rpc('record_ai_usage', {
      call_id: callId,
      inputs: result.usage.inputTokens ?? 0,
      outputs: result.usage.outputTokens ?? 0,
    });
    const image = await encodeDisplayImage(result.image);
    if (image.length > 8 * 1024 * 1024)
      throw new AppError('The generated image was too large.', 502);
    await rpc(db, 'complete_meal_image', {
      cache_key: cacheKey,
      image_data: image,
      media_type: 'image/webp',
    });
    return { image };
  } catch (error) {
    await Promise.resolve(db.rpc('fail_meal_image', { cache_key: cacheKey })).catch(
      () => undefined,
    );
    if (error instanceof AppError) throw error;
    throw new AppError('Meal image generation failed. Cooking is still available.', 502);
  }
}
