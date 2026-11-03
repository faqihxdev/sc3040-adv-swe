'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1 } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <Notifications />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function Notifications() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      position="top-center"
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
    />
  );
}
