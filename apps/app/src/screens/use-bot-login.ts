import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BotLogin, BotLoginError } from "@pace/client";

import { useAuth } from "../app-state.tsx";
import { openTelegram } from "../auth/open-telegram.ts";
import { LOGIN_FROM } from "../platform/login-from.ts";
import {
  clearPendingBotLogin,
  readPendingBotLogin,
  savePendingBotLogin,
} from "./bot-login-pending.ts";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export type BotLoginPhase =
  | { readonly kind: "error"; readonly error: "network" | BotLoginError }
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "waiting" };

/**
The Telegram bot flow: mint a nonce, open the bot (in the app when it is there), poll while this screen is
focused. A successful poll stores the token through `Auth`, so the caller only watches
the auth status; the poll is aborted whenever the screen loses focus or unmounts.
*/
export const useBotLogin = (): {
  readonly phase: BotLoginPhase;
  readonly start: () => Promise<void>;
  readonly reset: () => void;
  /** Opens the bot again with the same link; `null` when there is no link to open. */
  readonly reopen: (() => void) | null;
} => {
  const { auth } = useAuth();
  const [pending] = useState(() => readPendingBotLogin(Date.now()));
  const [phase, setPhase] = useState<BotLoginPhase>({
    kind: pending === null ? "idle" : "waiting",
  });
  const [login, setLogin] = useState<Pick<BotLogin, "nonce" | "waitForToken"> | undefined>(() =>
    pending === null ? undefined : auth.resumeBotLogin(pending.nonce),
  );
  const [expiresAt, setExpiresAt] = useState(pending?.expiresAt);
  const [deepLink, setDeepLink] = useState(pending?.deepLink);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const poll = useCallback(() => {
    if (login === undefined) {
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
  }, [expiresAt, login]);
  useFocusEffect(poll);

  const start = useCallback(async () => {
    setPhase({ kind: "starting" });
    try {
      const created = await auth.startBotLogin(LOGIN_FROM);
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
    } catch {
      clearPendingBotLogin();
      setLogin(undefined);
      setPhase({ error: "network", kind: "error" });
    }
  }, [auth]);

  const reset = useCallback(() => {
    clearPendingBotLogin();
    setLogin(undefined);
    setPhase({ kind: "idle" });
  }, []);

  const reopen = useCallback(() => {
    if (deepLink !== undefined) {
      void openTelegram(deepLink);
    }
  }, [deepLink]);

  return { phase, reopen: deepLink === undefined ? null : reopen, reset, start };
};
