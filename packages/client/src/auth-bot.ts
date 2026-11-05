import { endpoints, err, ok, type Result, type User } from "@pace/core";

import type { Session } from "./auth-session.ts";

import { type ApiClient, ApiError } from "./api-client.ts";

export type BotLoginError = "cancelled" | "not-allowed" | "timeout";

export type BotLoginPoll = {
  readonly nonce: string;
  /** Polls until the bot bound the nonce; the token is stored before it resolves. */
  readonly waitForToken: (options: {
    readonly intervalMs: number;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }) => Promise<Result<User, BotLoginError>>;
};

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

const acceptPoll = async (
  session: Session,
  poll: NonNullable<Poll>,
  owner: number,
): Promise<Result<User, BotLoginError>> => {
  if (!poll.ok) {
    return poll;
  }
  const saved = await session.signIn(poll.value, owner);
  return saved.ok && session.owns(owner) ? saved : err("cancelled");
};

const waitActive =
  (api: ApiClient, session: Session, nonce: string): BotLoginPoll["waitForToken"] =>
  async ({ intervalMs, signal, timeoutMs }) => {
    const deadline = Date.now() + timeoutMs;
    const owner = session.beginSignIn();
    const isCancelled = () => signal?.aborted === true || !session.owns(owner);
    while (Date.now() < deadline) {
      if (isCancelled()) {
        return err("cancelled");
      }
      const poll = await pollOnce(api, nonce);
      if (isCancelled()) {
        return err("cancelled");
      }
      if (poll !== undefined) {
        return await acceptPoll(session, poll, owner);
      }
      await sleep(intervalMs, signal);
    }
    return err("timeout");
  };

export const waitForToken =
  (api: ApiClient, session: Session, nonce: string): BotLoginPoll["waitForToken"] =>
  async (options) => {
    if (options.signal?.aborted === true) {
      return err("cancelled");
    }
    if (options.timeoutMs <= 0) {
      return err("timeout");
    }
    return await waitActive(api, session, nonce)(options);
  };
