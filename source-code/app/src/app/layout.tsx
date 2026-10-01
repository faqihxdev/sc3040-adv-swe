import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'UseEatNow · Good food, less waste',
  description: 'Your household ingredients, ready for their next meal.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
