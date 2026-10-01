import { z } from 'zod';
import { itemInput } from './model';

export const PHOTO_LIMITS = {
  items: 10,
  originalBytes: 12 * 1024 * 1024,
  uploadBytes: 2 * 1024 * 1024,
  edge: 1600,
} as const;
export const photoTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const photoResultSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        category: z.enum([
          'Vegetables',
          'Fruit',
          'Dairy',
          'Meat',
          'Protein',
          'Grains',
          'Other',
          '',
        ]),
        uncertain: z.boolean(),
      }),
    )
    .max(PHOTO_LIMITS.items),
  message: z.string().max(300),
  hasMore: z.boolean(),
});
export type PhotoResult = z.infer<typeof photoResultSchema>;
export const newItemSchema = itemInput.extend({ stock: z.number().int().min(1).max(5) });
export const batchItemsSchema = z.array(newItemSchema).min(1).max(PHOTO_LIMITS.items);
export function ingredientKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}
export function normalisePhotoResult(input: unknown): PhotoResult {
  const result = photoResultSchema.parse(input);
  const seen = new Set<string>();
  return {
    ...result,
    items: result.items.filter((item) => {
      const key = ingredientKey(item.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}
export function photoFileError(type: string, size: number): string {
  if (!(photoTypes as readonly string[]).includes(type))
    return 'Use a JPEG, PNG or WebP photo. Convert HEIC photos first.';
  if (!size) return 'This file is empty. Choose another photo.';
  if (size > PHOTO_LIMITS.originalBytes) return 'Choose a photo smaller than 12 MB.';
  return '';
}
export function isAnimatedPhoto(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      if (tag(offset) === 'ANIM' || tag(offset) === 'ANMF') return true;
      const size = view.getUint32(offset + 4, true);
      offset += 8 + size + (size % 2);
    }
  } else if (bytes.length >= 8 && bytes[0] === 137 && tag(1) === 'PNG\r') {
    for (let offset = 8; offset + 8 <= bytes.length;) {
      if (tag(offset + 4) === 'acTL') return true;
      offset += 12 + view.getUint32(offset);
    }
  }
  return false;
}
export function photoFormat(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
