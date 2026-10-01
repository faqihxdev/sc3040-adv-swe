'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="section-title">The kitchen is temporarily offline</h1>
      <p className="my-6 helper">Check that local Supabase is running, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
