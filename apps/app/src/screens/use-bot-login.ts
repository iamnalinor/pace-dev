import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import type { Auth, BotLogin, BotLoginError } from "@pace/client";

import { useAuth } from "../app-state.tsx";
import { openTelegram } from "../auth/open-telegram.ts";
import { LOGIN_FROM, loginDevice } from "../platform/login-from.ts";
import { serverStore } from "../platform/server-store.ts";
import {
  clearPendingBotLogin,
  readPendingBotLogin,
  savePendingBotLogin,
} from "./bot-login-pending.ts";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60_000;

/** Both login surfaces pause their bot flow while this server's configuration is invalid. */
export const useServerBotLogin = () => {
  const configurationError = useStore(serverStore, (state) => state.configurationError);
  const bot = useBotLogin(configurationError === null);
  return { bot, configurationError };
};

export type BotLoginPhase =
  | { readonly kind: "error"; readonly error: "network" | BotLoginError }
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "waiting" };

const useBotPolling = ({
  expiresAt,
  isEnabled,
  login,
  setLogin,
  setPhase,
}: {
  readonly expiresAt: number | undefined;
  readonly isEnabled: boolean;
  readonly login: Pick<BotLogin, "nonce" | "waitForToken"> | undefined;
  readonly setLogin: (login: undefined) => void;
  readonly setPhase: (phase: BotLoginPhase) => void;
}): void => {
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const poll = useCallback(() => {
    if (!isEnabled || login === undefined) {
      return;
    }
    const remaining = Math.max(0, (expiresAt ?? Date.now()) - Date.now());
    const controller = new AbortController();
    void (async () => {
      const result = await login.waitForToken({
        intervalMs: POLL_INTERVAL_MS,
        signal: controller.signal,
        timeoutMs: remaining,
      });
      if (!mountedRef.current || (!result.ok && result.error === "cancelled")) {
        return;
      }
      // On success the auth status flips to signed-in and the screen redirects.
      clearPendingBotLogin();
      setLogin(undefined);
      setPhase(result.ok ? { kind: "idle" } : { error: result.error, kind: "error" });
    })();
    return () => {
      controller.abort();
    };
  }, [expiresAt, isEnabled, login, setLogin, setPhase]);
  useFocusEffect(poll);
};

const createCurrentBotLogin = async (
  auth: Auth,
  isCurrent: () => boolean,
): Promise<BotLogin | undefined> => {
  const device = await loginDevice();
  return isCurrent() ? await auth.startBotLogin(LOGIN_FROM, device) : undefined;
};

const useLoginAttempts = (isEnabled: boolean) => {
  const lifetimeRef = useRef({ generation: 0, isEnabled });
  useEffect(() => {
    const lifetime = lifetimeRef.current;
    lifetime.isEnabled = isEnabled;
    return () => {
      lifetime.isEnabled = false;
      lifetime.generation += 1;
    };
  }, [isEnabled]);
  const invalidate = useCallback(() => {
    lifetimeRef.current.generation += 1;
  }, []);
  const begin = useCallback(() => {
    lifetimeRef.current.generation += 1;
    return lifetimeRef.current.generation;
  }, []);
  const isCurrent = useCallback(
    (generation: number) =>
      lifetimeRef.current.isEnabled && lifetimeRef.current.generation === generation,
    [],
  );
  return { begin, invalidate, isCurrent };
};

const useBotSession = (auth: Auth, isEnabled: boolean) => {
  const [pending] = useState(() => (isEnabled ? readPendingBotLogin(Date.now()) : null));
  const [phase, setPhase] = useState<BotLoginPhase>({
    kind: pending === null ? "idle" : "waiting",
  });
  const [login, setLogin] = useState<Pick<BotLogin, "nonce" | "waitForToken"> | undefined>(() =>
    pending === null ? undefined : auth.resumeBotLogin(pending.nonce),
  );
  const [wasEnabled, setWasEnabled] = useState(isEnabled);
  // Adjust this render's state when availability changes, before effects can restart a nonce.
  if (wasEnabled !== isEnabled) {
    setWasEnabled(isEnabled);
    if (!isEnabled) {
      setLogin(undefined);
      setPhase({ kind: "idle" });
    }
  }
  return { pending, phase, setPhase, login, setLogin };
};

/**
The Telegram bot flow: mint a nonce, open the bot (in the app when it is there), poll while this screen is
focused. A successful poll stores the token through `Auth`, so the caller only watches
the auth status; the poll is aborted whenever the screen loses focus or unmounts.
*/
export const useBotLogin = (
  isEnabled = true,
): {
  readonly phase: BotLoginPhase;
  readonly start: () => Promise<void>;
  readonly reset: () => void;
  /** Opens the bot again with the same link; `null` when there is no link to open. */
  readonly reopen: (() => void) | null;
} => {
  const { auth } = useAuth();
  const { pending, phase, setPhase, login, setLogin } = useBotSession(auth, isEnabled);
  const [expiresAt, setExpiresAt] = useState(pending?.expiresAt);
  const [deepLink, setDeepLink] = useState(pending?.deepLink);
  const { begin, invalidate, isCurrent } = useLoginAttempts(isEnabled);
  useEffect(() => {
    if (!isEnabled) {
      clearPendingBotLogin();
    }
  }, [isEnabled]);

  useBotPolling({ expiresAt, isEnabled, login, setLogin, setPhase });

  const acceptLogin = useCallback(
    async (created: BotLogin) => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      savePendingBotLogin({
        deepLink: created.deepLink,
        expiresAt: deadline,
        nonce: created.nonce,
      });
      setExpiresAt(deadline);
      setDeepLink(created.deepLink);
      setLogin(created);
      setPhase({ kind: "waiting" });
      await openTelegram(created.deepLink);
    },
    [setLogin, setPhase],
  );

  const failLogin = useCallback(() => {
    clearPendingBotLogin();
    setLogin(undefined);
    setPhase({ error: "network", kind: "error" });
  }, [setLogin, setPhase]);

  const start = useCallback(async () => {
    const attempt = begin();
    if (!isCurrent(attempt)) {
      return;
    }
    setPhase({ kind: "starting" });
    try {
      const created = await createCurrentBotLogin(auth, () => isCurrent(attempt));
      if (created === undefined || !isCurrent(attempt)) {
        return;
      }
      await acceptLogin(created);
    } catch {
      if (!isCurrent(attempt)) {
        return;
      }
      failLogin();
    }
  }, [acceptLogin, auth, begin, failLogin, isCurrent, setPhase]);

  const reset = useCallback(() => {
    invalidate();
    clearPendingBotLogin();
    setLogin(undefined);
    setPhase({ kind: "idle" });
  }, [invalidate, setLogin, setPhase]);

  const reopen = useCallback(() => {
    if (deepLink !== undefined) {
      void openTelegram(deepLink);
    }
  }, [deepLink]);

  return { phase, reopen: deepLink === undefined ? null : reopen, reset, start };
};
