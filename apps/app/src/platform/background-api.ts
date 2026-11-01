import { type ApiClient, createApiClient } from "@pace/client";

import { createSecureSessionStore } from "./secure-session.ts";
import { readServer } from "./server.ts";

/**
Bumped when the signed-in session ends on this phone (logout): a client built before it stops
sending its token, so a background run still in flight shows and sends nothing more for it.
*/
const sessions = { epoch: 0 };

/** The session this phone had is over: background clients built for it go quiet. */
export const endBackgroundSessions = (): void => {
  sessions.epoch += 1;
};

/** The stored session's token, read for the stored server (another server's token reads as none). */
export const backgroundToken = async (): Promise<null | string> =>
  await createSecureSessionStore(await readServer()).get();

/**
The API as the signed-in phone for work without the open app (a push, an answer button, the
periodic check), `null` when signed out: the stored server and the token stored for it, read
together, so nothing is ever sent to a server the token is not for (a token kept for server A
reads as signed out once the phone points at B).
*/
export const backgroundApi = async (): Promise<ApiClient | null> => {
  // Taken before the reads: a logout while they are on their way already counts.
  const { epoch } = sessions;
  const baseUrl = await readServer();
  const stored = await createSecureSessionStore(baseUrl).get();
  return stored === null
    ? null
    : createApiClient({ baseUrl, token: () => (epoch === sessions.epoch ? stored : undefined) });
};
