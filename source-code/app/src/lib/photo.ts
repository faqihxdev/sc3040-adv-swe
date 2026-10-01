import {
  PHOTO_LIMITS,
  photoFileError,
  photoResultSchema,
  isAnimatedPhoto,
  photoFormat,
  type PhotoResult,
} from '@/domain/photo';
import { ApiError } from './api';

export async function preparePhoto(file: File): Promise<Blob> {
  const error = photoFileError(file.type, file.size);
  if (error) throw new Error(error);
  const source = new Uint8Array(await file.arrayBuffer());
  if (!photoFormat(source)) throw new Error('This file is not a JPEG, PNG or WebP photo.');
  if (isAnimatedPhoto(source)) throw new Error('Choose a still photo, not an animated image.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This photo could not be opened. Choose a JPEG, PNG or WebP photo.');
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60_000_000)
      throw new Error('This photo is too large to process. Use a smaller image.');
    const scale = Math.min(1, PHOTO_LIMITS.edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('Photo processing failed. Try another image.')),
          'image/jpeg',
          quality,
        ),
      );
      if (blob.size <= PHOTO_LIMITS.uploadBytes) return blob;
    }
    throw new Error('This photo is still too large. Choose a simpler or smaller image.');
  } finally {
    bitmap.close();
  }
}

export async function recognisePhoto(photo: Blob, signal: AbortSignal): Promise<PhotoResult> {
  const response = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': photo.type },
    body: photo,
    signal,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error ?? 'Photo recognition is unavailable. Retry or add ingredients manually.',
      response.status,
    );
  const parsed = photoResultSchema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      'Recognition returned an unreadable result. Retry or add ingredients manually.',
    );
  return parsed.data;
}
