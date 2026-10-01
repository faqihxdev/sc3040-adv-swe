import { NextResponse } from 'next/server';
import { PHOTO_LIMITS, photoTypes } from '@/domain/photo';
import { serverDb } from '@/lib/supabase/server';
import { assertRequestOrigin, readBytes, failure, databaseError } from '@/server/http';
import { sanitisePhoto } from '@/server/photo-image';
import { recogniseIngredients } from '@/server/photo-recognition';
import { AppError } from '@/server/errors';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertRequestOrigin(request);
    if (!(photoTypes as readonly string[]).includes(request.headers.get('content-type') ?? ''))
      throw new AppError('Use a JPEG, PNG or WebP photo.', 415);
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new AppError('Sign in to continue.', 401);
    const { data: member, error } = await db
      .from('memberships')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) databaseError(error);
    if (!member) throw new AppError('Join a household first.', 403);
    const bytes = await readBytes(request, PHOTO_LIMITS.uploadBytes);
    let photo: Buffer;
    try {
      photo = await sanitisePhoto(bytes);
    } catch {
      throw new AppError(
        'This photo could not be read. Use a non-animated JPEG, PNG or WebP photo.',
      );
    }
    return NextResponse.json(await recogniseIngredients(user.id, photo, request.signal), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
