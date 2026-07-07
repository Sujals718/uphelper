"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AccountDisabledError } from "@/lib/api-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A disabled account is a permanent condition for the rest of
            // this session, not a transient failure — retrying it 3x
            // (React Query's default) just delays the friendly message
            // showing up for no benefit. Every other error keeps the
            // default retry behavior untouched.
            retry: (failureCount, error) => (error instanceof AccountDisabledError ? false : failureCount < 3),
          },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
