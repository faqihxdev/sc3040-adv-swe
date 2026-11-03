import sharp from 'sharp';
import { PHOTO_LIMITS } from '@/domain/photo';

// Decode actual bytes, not filenames or client MIME assertions. Re-encoding strips metadata.
export async function sanitisePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.length || bytes.length > PHOTO_LIMITS.uploadBytes)
    throw new Error('Photo must be smaller than 2 MB after processing.');
  const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
    throw new Error('Use a single, non-animated JPEG, PNG or WebP photo.');
  return image
    .rotate()
    .resize({
      width: PHOTO_LIMITS.edge,
      height: PHOTO_LIMITS.edge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82 })
    .toBuffer();
}
