import { QueryClient } from "@tanstack/react-query";

// STATE: TanStack Query for server state
// SHARED BETWEEN PROTOTYPE AND LIVE
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
