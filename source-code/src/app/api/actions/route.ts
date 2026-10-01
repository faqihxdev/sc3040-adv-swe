import { NextResponse } from 'next/server';
import { commandSchema } from '@/domain/model';
import { serverDb, adminDb } from '@/lib/supabase/server';
import { readBody, failure, databaseError } from '@/server/http';
import { AppError } from '@/server/state';
export async function POST(request: Request) {
  try {
    const input = commandSchema.parse(await readBody(request));
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new AppError('Sign in to continue.', 401);
    if (input.command === 'add_items') {
      const { data, error } = await db.rpc('add_inventory_batch', {
        expected_household: input.householdId,
        request_id: input.requestId,
        items_data: input.items,
      });
      if (error) databaseError(error);
      return NextResponse.json(data);
    }
    if (input.command === 'delete_account') {
      // The owner FK refuses deletion atomically until ownership is resolved.
      const { error } = await adminDb().auth.admin.deleteUser(user.id);
      if (error)
        throw new AppError(
          'Transfer ownership or delete your household before deleting your account.',
        );
      await db.auth.signOut();
      return NextResponse.json({ deleted: true });
    }
    const { data, error } = await db.rpc('mutate', { command: input.command, payload: input });
    if (error) databaseError(error);
    return NextResponse.json(data);
  } catch (e) {
    return failure(e);
  }
}
