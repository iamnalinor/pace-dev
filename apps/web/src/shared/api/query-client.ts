import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "./unwrap.ts";

const isClientError = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;

/**
 * @param onUnauthorized called when any request gets 401 — the session expired or was
 *   revoked elsewhere. The app sends the user to sign-in instead of showing an error.
 */
export const createQueryClient = (onUnauthorized: () => void): QueryClient => {
  const handleError = (error: unknown): void => {
    if (isUnauthorized(error)) {
      onUnauthorized();
    }
  };
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: {
        // 4xx will not fix itself: retry only network errors and 5xx.
        retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
        staleTime: 10_000,
      },
    },
    mutationCache: new MutationCache({ onError: handleError }),
    queryCache: new QueryCache({ onError: handleError }),
  });
};
