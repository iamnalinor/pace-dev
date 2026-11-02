import { createStore, type StoreApi } from "zustand/vanilla";

import {
  endpoints,
  err,
  ok,
  type Result,
  type TelegramLogin,
  type User,
  UserSchema,
} from "@pace/core";

import { type ApiClient, ApiError } from "./api-client.ts";
import { noteMark, type SessionStore, type SignOutNotes, tryStore } from "./session.ts";

export type AuthState = {
  readonly status: "loading" | "signed-in" | "signed-out";
  /** Known after a login or `me()`; `null` right after startup with a stored token. */
  readonly user: null | User;
  /**
  Signed out because the server no longer knew the session (ended on another device, or
  expired): the login card says so. Absent otherwise; a new session clears it.
  */
  readonly endedElsewhere?: true | undefined;
  /**
  Signed out because another tab of this browser logged out: the login card says that instead
  (QA round 18 L3). Only on that tab's word (a note it leaves before its log-out goes out), never
  inferred from a store found empty (fix round 5 V1). Absent otherwise.
  */
  readonly endedInAnotherTab?: true | undefined;
};

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

/** The phone a bot login starts on: its model and its install id. */
export type LoginDevice = { readonly deviceName?: string; readonly deviceId?: string };

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
  /** Tells the server, then forgets the token even when the server could not be reached. */
  readonly logout: () => Promise<void>;
  /**
  Forgets the token without telling the server, which ended the session already (this device
  revoked from its own list): a logout would only answer 401 (QA round 15 L2).
  */
  readonly forget: () => Promise<void>;
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
  /** Fetches the signed-in user; a 401 signs out locally. */
  readonly me: () => Promise<Result<User, string>>;
  /**
  Signs in with a token minted outside these flows (a browser fallback, an App Link) by
  loading the user behind it; a token the server rejects leaves the device signed out.
  */
  readonly adoptToken: (token: string) => Promise<Result<User, string>>;
};

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

type Granted = { readonly token: string; readonly user: User };

type SignOutReason = { readonly endedElsewhere: true } | { readonly endedInAnotherTab: true };

type Session = {
  readonly ready: Promise<void>;
  readonly store: StoreApi<AuthState>;
  readonly token: () => string | undefined;
  readonly signIn: (granted: Granted) => Promise<User>;
  /**
  Why, when the person did not sign out here: the server no longer knew the session
  (`endedElsewhere`), or another tab of this browser signed out (`endedInAnotherTab`).
  */
  readonly signOut: (reason?: SignOutReason) => Promise<void>;
  /**
  Whether another tab of this browser logged `token` out (it left its note first); false when
  there is no word of it, or no way to read one.
  */
  readonly isLoggedOutInAnotherTab: (token: string) => Promise<boolean>;
  /** Leaves that note for `token` before this tab logs it out; nothing when it cannot. */
  readonly leaveNote: (token: string) => Promise<void>;
  /** Remembers a token whose user is not known yet. */
  readonly adopt: (token: string) => Promise<void>;
};

/** The in-memory token (read synchronously by the API client) mirrored to the session store. */
const createSession = (sessionStore: SessionStore, notes: SignOutNotes | undefined): Session => {
  const store = createStore<AuthState>(() => ({ status: "loading", user: null }));
  let cached: string | undefined;
  return {
    adopt: async (token) => {
      cached = token;
      await sessionStore.set(token);
      store.setState({
        endedElsewhere: undefined,
        endedInAnotherTab: undefined,
        status: "signed-in",
        user: null,
      });
    },
    ready: (async (): Promise<void> => {
      cached = (await sessionStore.get()) ?? undefined;
      store.setState({ status: cached === undefined ? "signed-out" : "signed-in" });
    })(),
    signIn: async (granted) => {
      cached = granted.token;
      await sessionStore.set(granted.token);
      store.setState({
        endedElsewhere: undefined,
        endedInAnotherTab: undefined,
        status: "signed-in",
        user: granted.user,
      });
      return granted.user;
    },
    isLoggedOutInAnotherTab: async (token) =>
      notes !== undefined &&
      (await tryStore(async () => await notes.read(), null)) === noteMark(token),
    leaveNote: async (token) => {
      if (notes !== undefined) {
        await tryStore(async () => {
          await notes.leave(noteMark(token));
        }, undefined);
      }
    },
    signOut: async (reason) => {
      cached = undefined;
      // A store that fails to forget still leaves this tab signed out.
      await tryStore(async () => {
        await sessionStore.clear();
      }, undefined);
      store.setState({
        endedElsewhere: reason !== undefined && "endedElsewhere" in reason ? true : undefined,
        endedInAnotherTab: reason !== undefined && "endedInAnotherTab" in reason ? true : undefined,
        status: "signed-out",
        user: null,
      });
    },
    store,
    token: () => cached,
  };
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
  | "forget"
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
  finishAccountDeletion: async () => {
    await session.signOut();
  },
  /**
  The server ended the session already: no logout to send. The person ended it here, so the
  other tabs are told it was this browser (after the fact: a tab whose 401 comes first says
  another device).
  */
  forget: async () => {
    const ended = session.token();
    if (ended !== undefined) {
      await session.leaveNote(ended);
    }
    await session.signOut();
  },
});

/**
Fetches the signed-in user. A 401 signs out as "ended elsewhere", but only for the token the
request carried and only while it is still the one in use: a 401 for a token this device has
forgotten or replaced meanwhile (it ended its own session) says nothing about the session in use
(fix round 1).
*/
const meOf = (api: ApiClient, session: Session) => async (): Promise<Result<User, string>> => {
  const sent = session.token();
  try {
    // The answer carries the store id too; the sync confirms that on its own pulls.
    const user = UserSchema.parse(await api.call(endpoints.me, {}));
    session.store.setState({ status: "signed-in", user });
    return ok(user);
  } catch (error) {
    if (
      sent !== undefined &&
      error instanceof ApiError &&
      error.status === 401 &&
      session.token() === sent
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
    adoptToken: async (token) => {
      await session.adopt(token);
      const result = await me();
      if (!result.ok) {
        await session.signOut();
      }
      return result;
    },
    loginWithDev: async (telegramId) =>
      await login(async () => await api.call(endpoints.auth.dev, { body: { telegramId } })),
    loginWithTelegram: async (payload) =>
      await login(async () => await api.call(endpoints.auth.telegram, { body: payload })),
    logout: async () => {
      const leaving = session.token();
      // The note goes before the request: another tab's 401 can come before its answer.
      if (leaving !== undefined) {
        await session.leaveNote(leaving);
      }
      try {
        await api.call(endpoints.auth.logout, {});
      } catch {
        // The session is dropped locally regardless; the server expires it on its own.
      } finally {
        await session.signOut();
      }
    },
    me,
    ready: session.ready,
    resumeBotLogin: (nonce) => ({ nonce, waitForToken: waitForToken(api, session, nonce) }),
    startBotLogin: async (from, device) => {
      const created = await api.call(endpoints.auth.nonceCreate, { body: device, query: { from } });
      return { ...created, waitForToken: waitForToken(api, session, created.nonce) };
    },
    store: session.store,
    token: session.token,
  };
};
