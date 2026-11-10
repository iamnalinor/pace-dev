import type { StoreApi } from "zustand/vanilla";

import { endpoints, err, ok, type Result, type TelegramLogin, type User } from "@pace/core";

import { type ApiClient, ApiError } from "./api-client.ts";
import { type BotLoginPoll, type PollDeps, waitForToken } from "./auth-bot.ts";
import {
  type AuthState,
  createSession,
  type Granted,
  type Session,
  SESSION_CHANGED,
} from "./auth-session.ts";
import { meOf } from "./auth-user.ts";
import { createEndedSessions, type EndedSessionsState, endingLogout } from "./ended-sessions.ts";
import { cleanLoginDevice, createNonce, type LoginDevice } from "./login-device.ts";
import {
  createMemoryEndedSessionStore,
  type EndedSessionStore,
  type SessionStore,
  type SignOutNotes,
} from "./session.ts";

export type { BotLoginError, BotLoginPoll } from "./auth-bot.ts";
export type { AuthState } from "./auth-session.ts";
/**
A session check whose token is no longer the one in use when it is answered: nothing was wrong
with that token; the device moved on (a Log out, a newer login) while it was on its way.
*/
export { SESSION_CHANGED } from "./auth-session.ts";
export type { EndedSessionsState } from "./ended-sessions.ts";

export type { LoginDevice } from "./login-device.ts";

export type AccountAction = "delete" | "wipe";
export type AccountConfirmation = { readonly id: string; readonly expiresAt: string };
export type AccountConfirmationStatus =
  | "cancelled"
  | "confirmed"
  | "expired"
  | "pending"
  | "replaced";

export type BotLogin = {
  readonly deepLink: string;
  readonly nonce: string;
  /** Polls until the bot bound the nonce; the token is stored before it resolves. */
  readonly waitForToken: BotLoginPoll["waitForToken"];
};

/**
Login flows and the session token. `token()` is synchronous (the API client reads it on
every request), so wire the two with a closure:
`const api = createApiClient({ baseUrl, token: () => auth.token() }); const auth = createAuth({ api, session });`
*/
export type Auth = {
  readonly store: StoreApi<AuthState>;
  /** Drain and clear all login writes before a host changes its durable server. */
  readonly suspendSignIn: () => Promise<void>;
  /** Used only when a failed handoff confirms this server is still selected. */
  readonly resumeSignIn: () => void;
  /** Resolves once the stored token is loaded. */
  readonly ready: Promise<void>;
  readonly token: () => string | undefined;
  /**
  Whether this device's session ended since it started (signed out by hand, from the list, by a
  401 or a refused adopted token) and no new one began: the API client then sends nothing that
  needs a session (QA round 22 R22-02).
  */
  readonly hasEnded: () => boolean;
  /** Errors are the API's code (`auth/not-allowed`, ...) or `network`. */
  readonly loginWithTelegram: (payload: TelegramLogin) => Promise<Result<User, string>>;
  readonly loginWithDev: (telegramId: string) => Promise<Result<User, string>>;
  /**
  `from`: where the login starts; the bot's "Return to Pace" leads back there. The app names its
  phone (`device`), so the session it opens is called after it; the web sends none.
  */
  readonly startBotLogin: (from: "app" | "web", device?: LoginDevice) => Promise<BotLogin>;
  /** Rebuilds the poller for a nonce held by a login page across a reload. */
  readonly resumeBotLogin: (nonce: string) => BotLoginPoll;
  /**
  Forgets the token, then tells the server with it (even when the server cannot be reached, the
  device stays signed out): nothing else is sent with the session once the person signed out. A
  log-out the server did not hear is kept (`endedSessions`) and sent again until it is (R22-02).
  */
  readonly logout: () => Promise<void>;
  /** Whether a session this device signed out of still waits for the server to end it. */
  readonly endedSessions: StoreApi<EndedSessionsState>;
  /**
  Sends the log-outs still waiting again (the network may be back): at most one request per
  session at a time, and none once the server answered. Also run at start and after a login.
  */
  readonly retryEndedSessions: () => Promise<void>;
  /**
  Ends this device's own session from its device list: `revoke` asks the server, then the token
  is forgotten without a logout, which would only answer 401 (QA round 15 L2). The other tabs'
  note goes first, and a 401 this tab hears meanwhile for that session is its own act, not an end
  elsewhere (round 6 M1). A failed `revoke` keeps the session, takes the note back and rethrows.
  */
  readonly endThisDevice: (revoke: () => Promise<void>) => Promise<void>;
  /** Whether this device is ending its own session (`endThisDevice` under way): start nothing new. */
  readonly isEnding: () => boolean;
  /** The destructive action runs only after its Telegram button is confirmed. */
  readonly requestAccountConfirmation: (
    action: AccountAction,
  ) => Promise<Result<AccountConfirmation, string>>;
  /** Uses the request's opaque capability, so deletion can still be observed after sessions vanish. */
  readonly accountConfirmationStatus: (
    id: string,
  ) => Promise<Result<AccountConfirmationStatus, string>>;
  readonly cancelAccountConfirmation: (
    id: string,
  ) => Promise<Result<AccountConfirmationStatus, string>>;
  readonly finishAccountDeletion: () => Promise<void>;
  /** Fetches the signed-in user; a 401 signs out locally. `signal` gives up on it (signs nothing out). */
  readonly me: (signal?: AbortSignal) => Promise<Result<User, string>>;
  /**
  Signs in with a token minted outside these flows (a browser fallback, an App Link) by
  loading the user behind it; a token the server rejects leaves the device signed out.
  */
  readonly adoptToken: (token: string) => Promise<Result<User, string>>;
  /**
  Whether the device's session store holds a session. After a sign-out it is another tab's newer
  one (the store is shared by a browser's tabs): the local copy is that session's, not this tab's
  to wipe (round 6 I1). False when the store cannot be read.
  */
  readonly isSessionStored: () => Promise<boolean>;
};

const errorCode = (error: unknown): string => (error instanceof ApiError ? error.code : "network");

const confirmationActions = (
  api: ApiClient,
  session: Session,
): Pick<
  Auth,
  | "accountConfirmationStatus"
  | "cancelAccountConfirmation"
  | "finishAccountDeletion"
  | "requestAccountConfirmation"
> => ({
  requestAccountConfirmation: async (action) => {
    try {
      return ok(await api.call(endpoints.account.createConfirmation, { body: { action } }));
    } catch (error) {
      return err(errorCode(error));
    }
  },
  accountConfirmationStatus: async (id) => {
    try {
      const answer = await api.call(endpoints.account.confirmationStatus, { params: { id } });
      return ok(answer.status);
    } catch (error) {
      return err(errorCode(error));
    }
  },
  cancelAccountConfirmation: async (id) => {
    try {
      const answer = await api.call(endpoints.account.cancelConfirmation, { params: { id } });
      return ok(answer.status);
    } catch (error) {
      return err(errorCode(error));
    }
  },
  /**
  The person deleted the account here (confirmed in Telegram): the other tabs are told it was this
  browser, not another device (round 6 M2). After the fact: a tab whose 401 came first says
  another device.
  */
  finishAccountDeletion: async () => {
    const owner = session.owner();
    const ended = session.token();
    if (ended !== undefined) {
      await session.leaveNote(ended);
    }
    await session.signOut(undefined, owner);
  },
});

/** See `Auth.endThisDevice`. */
const endThisDeviceOf =
  (session: Session): Auth["endThisDevice"] =>
  async (revoke) => {
    const owner = session.owner();
    const ending = session.token();
    if (ending === undefined) {
      await revoke();
      return;
    }
    // Before the request: another tab's 401 can come before its answer.
    await session.leaveNote(ending);
    session.setEnding(ending);
    try {
      await revoke();
    } catch (error) {
      await session.withdrawNote(ending);
      throw error;
    } finally {
      session.setEnding(undefined);
    }
    // The server ended it already: no logout to send.
    if (session.token() === ending) {
      await session.signOut(undefined, owner);
    }
  };

const loginOf =
  (session: Session, canSignIn: () => boolean, reached: () => void) =>
  async (grant: () => Promise<Granted>): Promise<Result<User, string>> => {
    try {
      if (!canSignIn()) {
        return err(SESSION_CHANGED);
      }
      const owner = session.beginSignIn();
      const granted = await grant();
      reached();
      return await session.signIn(granted, owner);
    } catch (error) {
      return err(errorCode(error));
    }
  };

const adoptTokenOf =
  (session: Session, me: Auth["me"], canSignIn: () => boolean): Auth["adoptToken"] =>
  async (token) => {
    if (!canSignIn()) {
      return err(SESSION_CHANGED);
    }
    const owner = session.beginSignIn();
    const saved = await session.adopt(token, owner);
    if (!saved.ok || !session.owns(owner)) {
      return err(SESSION_CHANGED);
    }
    const result = await me();
    const current = session.token();
    if (!result.ok && (current === token || current === undefined)) {
      await session.signOut(undefined, owner);
    }
    return result;
  };

export const createAuth = (options: {
  readonly api: ApiClient;
  readonly session: SessionStore;
  /** The host may retire authentication while a server handoff awaits restart. */
  readonly canSignIn?: (() => boolean) | undefined;
  /** Shared with the other tabs of the browser profile; absent in the app (one process). */
  readonly notes?: SignOutNotes | undefined;
  /** The log-outs the server has not heard yet, kept between starts; in memory when absent. */
  readonly ended?: EndedSessionStore | undefined;
}): Auth => {
  const { api } = options;
  const canSignIn = options.canSignIn ?? (() => true);
  const session = createSession(options.session, options.notes, canSignIn);
  const ended = createEndedSessions(api, options.ended ?? createMemoryEndedSessionStore());
  const { reached } = ended;

  const login = loginOf(session, canSignIn, reached);

  const me = meOf(api, session);
  const polls: PollDeps = { api, reached, session };

  return {
    ...confirmationActions(api, session),
    suspendSignIn: session.suspendSignIn,
    resumeSignIn: session.resumeSignIn,
    endThisDevice: endThisDeviceOf(session),
    adoptToken: adoptTokenOf(session, meOf(api, session, true), canSignIn),
    isEnding: () => session.ending() !== undefined,
    isSessionStored: session.isStored,
    loginWithDev: async (telegramId) =>
      await login(async () => await api.call(endpoints.auth.dev, { body: { telegramId } })),
    loginWithTelegram: async (payload) =>
      await login(async () => await api.call(endpoints.auth.telegram, { body: payload })),
    logout: endingLogout(session, ended),
    endedSessions: ended.store,
    retryEndedSessions: ended.retry,
    me,
    ready: (async (): Promise<void> => {
      await Promise.all([session.ready, ended.ready]);
    })(),
    resumeBotLogin: (nonce) => ({
      nonce,
      waitForToken: waitForToken(polls, nonce),
    }),
    startBotLogin: async (from, device) => {
      if (!canSignIn()) {
        throw new Error(SESSION_CHANGED);
      }
      const created = await createNonce(api, from, cleanLoginDevice(device));
      return { ...created, waitForToken: waitForToken(polls, created.nonce) };
    },
    hasEnded: session.hasEnded,
    store: session.store,
    token: session.token,
  };
};
