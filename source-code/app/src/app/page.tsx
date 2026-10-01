import { loadState, AppError } from '@/server/state';
import { Workspace } from '@/components/workspace';
import { Landing } from '@/components/landing';
export const dynamic = 'force-dynamic';
export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="section-title">Start your local kitchen</h1>
        <p className="mt-4">
          Run <code>pnpm db:start</code>, then restart the development server.
        </p>
      </main>
    );
  let state;
  try {
    state = await loadState();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return <Landing />;
    throw error;
  }
  return <Workspace initialState={state} />;
}
