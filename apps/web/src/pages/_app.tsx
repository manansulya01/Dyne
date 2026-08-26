import type { AppProps } from "next/app";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SocketProvider } from "@/components/providers/SocketProvider";
import "@/styles/globals.css";

// Initialize React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
    },
  },
});

/**
 * Root app wrapper
 * Provides authentication, real-time, and query providers
 */
export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider>
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          <Component {...pageProps} />
        </SocketProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
