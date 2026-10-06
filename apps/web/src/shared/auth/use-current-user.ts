import { useQuery } from "@tanstack/react-query";

import { api } from "#web/shared/api/api-client.ts";
import { unwrap } from "#web/shared/api/unwrap.ts";

import { authClient } from "./auth-client.ts";

/**
 * The signed-in user as YOUR API sees it (GET /api/me through Eden).
 * The better-auth session answers "is someone signed in?"; application data about
 * the user comes from the API. Keyed by the session's user id, so signing in as
 * someone else can never show the previous user's data.
 */
export const useCurrentUser = () => {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  return useQuery({
    enabled: userId !== undefined,
    queryFn: async () => await unwrap(api.me.get()),
    queryKey: ["me", userId],
  });
};
