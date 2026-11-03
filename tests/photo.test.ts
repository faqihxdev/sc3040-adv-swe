import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  batchItemsSchema,
  normalisePhotoResult,
  photoFileError,
  isAnimatedPhoto,
  photoFormat,
  PHOTO_LIMITS,
} from '@/domain/photo';
import { sanitisePhoto } from '@/server/photo-image';
import { assertRequestOrigin, readBytes } from '@/server/http';
import { commandSchema } from '@/domain/model';

const item = {
  name: 'Tomato',
  quantity: 250,
  unit: 'g',
  expiry_date: '2026-10-05',
  category: 'Vegetables',
  location: '',
};
describe('photo drafts', () => {
  it('requires a measured quantity, unit and a real expiry date', () => {
    expect(batchItemsSchema.safeParse([{ ...item, quantity: 0 }]).success).toBe(false);
    expect(batchItemsSchema.safeParse([{ ...item, quantity: undefined }]).success).toBe(false);
    expect(batchItemsSchema.safeParse([{ ...item, unit: undefined }]).success).toBe(false);
    expect(batchItemsSchema.safeParse([{ ...item, expiry_date: '2026-02-30' }]).success).toBe(
      false,
    );
    expect(batchItemsSchema.safeParse([{ ...item, expiry_date: '' }]).success).toBe(false);
    expect(batchItemsSchema.parse([item])).toEqual([item]);
  });
  it('accepts one to ten items only', () => {
    expect(batchItemsSchema.safeParse([]).success).toBe(false);
    expect(batchItemsSchema.safeParse(Array(10).fill(item)).success).toBe(true);
    expect(batchItemsSchema.safeParse(Array(11).fill(item)).success).toBe(false);
  });
  it('deduplicates suggested names without inferring quantity, unit or expiry', () => {
    const result = normalisePhotoResult({
      items: [
        { name: ' Red  onion ', category: 'Vegetables', uncertain: true },
        { name: 'red onion', category: 'Vegetables', uncertain: false },
      ],
      message: '',
      hasMore: false,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('quantity');
    expect(result.items[0]).not.toHaveProperty('unit');
    expect(result.items[0]).not.toHaveProperty('expiry_date');
  });
  it('accepts no-food responses and rejects malformed model data', () => {
    expect(
      normalisePhotoResult({ items: [], message: 'No food visible.', hasMore: false }).items,
    ).toEqual([]);
    expect(() =>
      normalisePhotoResult({
        items: [{ name: '', category: '', uncertain: false }],
        message: '',
        hasMore: false,
      }),
    ).toThrow();
  });
  it('requires household and idempotency IDs in the save command', () => {
    expect(commandSchema.safeParse({ command: 'add_items', items: [item] }).success).toBe(false);
    expect(
      commandSchema.safeParse({
        command: 'add_items',
        householdId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        items: [item],
      }).success,
    ).toBe(true);
  });
  it('rejects unsupported and oversized uploads', () => {
    expect(photoFileError('image/heic', 100)).toContain('Convert HEIC');
    expect(photoFileError('image/jpeg', 0)).toContain('empty');
    expect(photoFileError('image/png', PHOTO_LIMITS.originalBytes + 1)).toContain('12 MB');
    expect(photoFileError('image/webp', 100)).toBe('');
  });
});
describe('image boundary', () => {
  it('checks actual file signatures rather than trusting renamed extensions', () => {
    expect(photoFormat(Buffer.from('<svg/>'))).toBeNull();
    expect(photoFormat(Buffer.from('GIF89a'))).toBeNull();
    expect(photoFormat(new Uint8Array([255, 216, 255, 0]))).toBe('image/jpeg');
    expect(photoFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });
  it('resizes without cropping, applies orientation, and strips EXIF', async () => {
    const source = await sharp({
      create: { width: 2200, height: 1100, channels: 3, background: '#fb8800' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const output = await sanitisePhoto(source);
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1600]);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });
  it('rejects invalid bytes, SVG, empty and oversized data', async () => {
    for (const source of [
      Buffer.from('not a photo'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      Buffer.alloc(0),
      Buffer.alloc(PHOTO_LIMITS.uploadBytes + 1),
    ])
      await expect(sanitisePhoto(source)).rejects.toThrow();
  });
  it('rejects animation rather than silently using a frame', async () => {
    const source = await sharp({
      create: { width: 5, height: 10, channels: 3, background: '#fff' },
    })
      .webp()
      .toBuffer();
    // Actual animation fixture is made from two stacked frames.
    const frames = Buffer.alloc(5 * 10 * 3);
    frames.fill(255, 5 * 5 * 3);
    const animated = await sharp(frames, {
      raw: { width: 5, height: 10, channels: 3, pageHeight: 5 },
    })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    expect((await sharp(source).metadata()).pages ?? 1).toBe(1);
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(isAnimatedPhoto(animated)).toBe(true);
    expect(isAnimatedPhoto(source)).toBe(false);
    await expect(sanitisePhoto(animated)).rejects.toThrow();
  });
});
describe('HTTP boundary', () => {
  it('rejects missing or foreign origins', () => {
    expect(() => assertRequestOrigin(new Request('http://127.0.0.1:3000/api/photos'))).toThrow();
    expect(() =>
      assertRequestOrigin(
        new Request('http://127.0.0.1:3000/api/photos', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
    ).toThrow();
  });
  it('enforces a byte cap on streamed bodies without Content-Length', async () => {
    const req = new Request('http://local', { method: 'POST', body: new Uint8Array(101) });
    await expect(readBytes(req, 100)).rejects.toMatchObject({ status: 413 });
    expect(
      (await readBytes(new Request('http://local', { method: 'POST', body: 'abc' }), 3)).toString(),
    ).toBe('abc');
  });
});
