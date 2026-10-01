import { NextResponse, type NextRequest } from 'next/server';
import { serverDb } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next =
    request.nextUrl.searchParams.get('next') === '/reset-password' ? '/reset-password' : '/';
  if (code) {
    const { error } = await (await serverDb()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL('/login?error=link', request.url));
}
