import { LoaderCircle } from 'lucide-react';
import { Brand } from '@/components/common';
export default function Loading() {
  return (
    <main
      className="grid min-h-dvh place-content-center gap-6 px-4"
      role="status"
      aria-label="Loading UseEatNow"
    >
      <Brand />
      <LoaderCircle
        className="mx-auto size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
        aria-hidden="true"
      />
    </main>
  );
}
