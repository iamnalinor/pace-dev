import { createStore, type StoreApi } from "zustand/vanilla";

import { endpoints, err, ok, type Result, type TelegramLogin, type User } from "@pace/core";

import type { SessionStore } from "./session.ts";

import { type ApiClient, ApiError } from "./api-client.ts";

export type AuthState = {
  readonly status: "loading" | "signed-in" | "signed-out";
  /** Known after a login or `me()`; `null` right after startup with a stored token. */
  readonly user: null | User;
};

export type BotLoginError = "cancelled" | "not-allowed" | "timeout";

export type BotLogin = {
  readonly deepLink: string;
  readonly nonce: string;
  /** Polls until the bot bound the nonce; the token is stored before it resolves. */
  readonly waitForToken: (options: {
    readonly intervalMs: number;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }) => Promise<Result<User, BotLoginError>>;
};

/**
 * Login flows and the session token. `token()` is synchronous (the API client reads it on
 * every request), so wire the two with a closure:
 * `const api = createApiClient({ baseUrl, token: () => auth.token() }); const auth = createAuth({ api, session });`
 */
export type Auth = {
  readonly store: StoreApi<AuthState>;
  /** Resolves once the stored token is loaded. */
  readonly ready: Promise<void>;
  readonly token: () => string | undefined;
  /** Errors are the API's code (`auth/not-allowed`, ...) or `network`. */
  readonly loginWithTelegram: (payload: TelegramLogin) => Promise<Result<User, string>>;
  readonly loginWithDev: (telegramId: string) => Promise<Result<User, string>>;
  readonly startBotLogin: () => Promise<BotLogin>;
  /** Tells the server, then forgets the token even when the server could not be reached. */
  readonly logout: () => Promise<void>;
  /** Fetches the signed-in user; a 401 signs out locally. */
  readonly me: () => Promise<Result<User, string>>;
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

type Session = {
  readonly ready: Promise<void>;
  readonly store: StoreApi<AuthState>;
  readonly token: () => string | undefined;
  readonly signIn: (granted: Granted) => Promise<User>;
  readonly signOut: () => Promise<void>;
};

/** The in-memory token (read synchronously by the API client) mirrored to the session store. */
const createSession = (sessionStore: SessionStore): Session => {
  const store = createStore<AuthState>(() => ({ status: "loading", user: null }));
  let cached: string | undefined;
  return {
    ready: (async (): Promise<void> => {
      cached = (await sessionStore.get()) ?? undefined;
      store.setState({ status: cached === undefined ? "signed-out" : "signed-in" });
    })(),
    signIn: async (granted) => {
      cached = granted.token;
      await sessionStore.set(granted.token);
      store.setState({ status: "signed-in", user: granted.user });
      return granted.user;
    },
    signOut: async () => {
      cached = undefined;
      await sessionStore.clear();
      store.setState({ status: "signed-out", user: null });
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

export const createAuth = (options: {
  readonly api: ApiClient;
  readonly session: SessionStore;
}): Auth => {
  const { api } = options;
  const session = createSession(options.session);

  const login = async (grant: () => Promise<Granted>): Promise<Result<User, string>> => {
    try {
      return ok(await session.signIn(await grant()));
    } catch (error) {
      return err(errorCode(error));
    }
  };

  return {
    loginWithDev: async (telegramId) =>
      await login(async () => await api.call(endpoints.auth.dev, { body: { telegramId } })),
    loginWithTelegram: async (payload) =>
      await login(async () => await api.call(endpoints.auth.telegram, { body: payload })),
    logout: async () => {
      try {
        await api.call(endpoints.auth.logout, {});
      } catch {
        // The session is dropped locally regardless; the server expires it on its own.
      } finally {
        await session.signOut();
      }
    },
    me: async () => {
      try {
        const user = await api.call(endpoints.me, {});
        session.store.setState({ status: "signed-in", user });
        return ok(user);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await session.signOut();
        }
        return err(errorCode(error));
      }
    },
    ready: session.ready,
    startBotLogin: async () => {
      const created = await api.call(endpoints.auth.nonceCreate, {});
      return { ...created, waitForToken: waitForToken(api, session, created.nonce) };
    },
    store: session.store,
    token: session.token,
  };
};
