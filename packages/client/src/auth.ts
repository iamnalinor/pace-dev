import type { StoreApi } from "zustand/vanilla";

import {
  endpoints,
  err,
  ok,
  type Result,
  type TelegramLogin,
  type User,
  UserSchema,
} from "@pace/core";

import type { SessionStore, SignOutNotes } from "./session.ts";

import { type ApiClient, ApiError } from "./api-client.ts";
import { type AuthState, createSession, type Granted, type Session } from "./auth-session.ts";
import { cleanLoginDevice, createNonce, type LoginDevice } from "./login-device.ts";

export type { AuthState } from "./auth-session.ts";
export type { LoginDevice } from "./login-device.ts";

export type BotLoginError = "cancelled" | "not-allowed" | "timeout";

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

export type BotLoginPoll = {
  readonly nonce: string;
  /** Polls until the bot bound the nonce; the token is stored before it resolves. */
  readonly waitForToken: (options: {
    readonly intervalMs: number;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }) => Promise<Result<User, BotLoginError>>;
};

/**
Login flows and the session token. `token()` is synchronous (the API client reads it on
every request), so wire the two with a closure:
`const api = createApiClient({ baseUrl, token: () => auth.token() }); const auth = createAuth({ api, session });`
*/
export type Auth = {
  readonly store: StoreApi<AuthState>;
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
  device stays signed out): nothing else is sent with the session once the person signed out.
  */
  readonly logout: () => Promise<void>;
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

/**
A session check whose token is no longer the one in use when it is answered: nothing was wrong
with that token; the device moved on (a Log out, a newer login) while it was on its way.
*/
export const SESSION_CHANGED = "session/changed";

const errorCode = (error: unknown): string => (error instanceof ApiError ? error.code : "network");

const sleep = async (ms: number, signal: AbortSignal | undefined): Promise<void> => {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", finish);
      resolve();
    }, ms);
    const finish = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", finish, { once: true });
  });
};

/** A poll either yields the session, a final error, or nothing (keep polling). */
type Poll = Result<{ readonly token: string; readonly user: User }, BotLoginError> | undefined;

const pollOnce = async (api: ApiClient, nonce: string): Promise<Poll> => {
  try {
    const result = await api.call(endpoints.auth.noncePoll, { params: { nonce } });
    return result.status === "ready" ? ok(result) : undefined;
  } catch (error) {
    if (error instanceof ApiError && error.code === "auth/not-allowed") {
      return err("not-allowed");
    }
    // The nonce is gone (expired or consumed); 5xx and transport errors are transient.
    return error instanceof ApiError && error.status < 500 ? err("timeout") : undefined;
  }
};

const waitForToken =
  (api: ApiClient, session: Session, nonce: string): BotLogin["waitForToken"] =>
  async ({ intervalMs, signal, timeoutMs }) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted === true) {
        return err("cancelled");
      }
      const poll = await pollOnce(api, nonce);
      if (poll !== undefined) {
        return poll.ok ? ok(await session.signIn(poll.value)) : poll;
      }
      await sleep(intervalMs, signal);
    }
    return err("timeout");
  };

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
    const ended = session.token();
    if (ended !== undefined) {
      await session.leaveNote(ended);
    }
    await session.signOut();
  },
});

/** See `Auth.endThisDevice`. */
const endThisDeviceOf =
  (session: Session): Auth["endThisDevice"] =>
  async (revoke) => {
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
      await session.signOut();
    }
  };

/**
Fetches the signed-in user. A 401 signs out as "ended elsewhere", but only for the token the
request carried and only while it is still the one in use: a 401 for a token this device has
forgotten or replaced meanwhile (it ended its own session) says nothing about the session in use
(fix round 1).
*/
const meOf =
  (api: ApiClient, session: Session) =>
  async (signal?: AbortSignal): Promise<Result<User, string>> => {
    const sent = session.token();
    try {
      // The answer carries the store id too; the sync confirms that on its own pulls.
      const user = UserSchema.parse(
        await api.call(endpoints.me, {}, signal === undefined ? {} : { signal }),
      );
      // An answer for a token this device dropped or replaced meanwhile (a Log out while the check
      // was on its way) writes nothing: it would sign a wiped device back in (fix round 1 of QA 22).
      if (session.token() !== sent) {
        return err(SESSION_CHANGED);
      }
      session.store.setState({ status: "signed-in", user });
      return ok(user);
    } catch (error) {
      if (
        sent !== undefined &&
        error instanceof ApiError &&
        error.status === 401 &&
        session.token() === sent &&
        session.ending() !== sent
      ) {
        // "Another tab" only on its note: a store found empty proves nothing (another tab heard
        // the same 401 first, blocked storage, a log-out whose answer is still on its way).
        await session.signOut(
          (await session.isLoggedOutInAnotherTab(sent))
            ? { endedInAnotherTab: true }
            : { endedElsewhere: true },
        );
      }
      return err(errorCode(error));
    }
  };

export const createAuth = (options: {
  readonly api: ApiClient;
  readonly session: SessionStore;
  /** Shared with the other tabs of the browser profile; absent in the app (one process). */
  readonly notes?: SignOutNotes | undefined;
}): Auth => {
  const { api } = options;
  const session = createSession(options.session, options.notes);

  const login = async (grant: () => Promise<Granted>): Promise<Result<User, string>> => {
    try {
      return ok(await session.signIn(await grant()));
    } catch (error) {
      return err(errorCode(error));
    }
  };

  const me = meOf(api, session);

  return {
    ...confirmationActions(api, session),
    endThisDevice: endThisDeviceOf(session),
    adoptToken: async (token) => {
      await session.adopt(token);
      const result = await me();
      // Dropped (and never "ended elsewhere": it was no session yet) unless a login since then
      // holds the device: that newer session stays.
      const current = session.token();
      if (!result.ok && (current === token || current === undefined)) {
        await session.signOut();
      }
      return result;
    },
    isEnding: () => session.ending() !== undefined,
    isSessionStored: session.isStored,
    loginWithDev: async (telegramId) =>
      await login(async () => await api.call(endpoints.auth.dev, { body: { telegramId } })),
    loginWithTelegram: async (payload) =>
      await login(async () => await api.call(endpoints.auth.telegram, { body: payload })),
    logout: async () => {
      const leaving = session.token();
      if (leaving === undefined) {
        await session.signOut();
        return;
      }
      // The note goes before anything else: another tab's 401 can come before the answer.
      await session.leaveNote(leaving);
      // Forgotten here first, then the server is told with the token it had: once the server
      // ends the session it closes this device's socket (4401) and answers anything else 401,
      // and a check or a sync set off by that would read the person's own sign-out as "ended
      // elsewhere" (QA round 22 R22-02). Signed out, the device sends nothing more with it.
      await session.signOut();
      try {
        await api.call(endpoints.auth.logout, {}, { credential: leaving });
      } catch {
        // The session is dropped locally regardless; the server expires it on its own.
      }
    },
    me,
    ready: session.ready,
    resumeBotLogin: (nonce) => ({ nonce, waitForToken: waitForToken(api, session, nonce) }),
    startBotLogin: async (from, device) => {
      const body = cleanLoginDevice(device);
      const created = await createNonce(api, from, body);
      return { ...created, waitForToken: waitForToken(api, session, created.nonce) };
    },
    hasEnded: session.hasEnded,
    store: session.store,
    token: session.token,
  };
};
