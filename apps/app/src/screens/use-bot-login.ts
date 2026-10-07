import { openURL } from "expo-linking";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BotLogin, BotLoginError } from "@pace/client";

import { useAuth } from "../app-state.tsx";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export type BotLoginPhase =
  | { readonly kind: "error"; readonly error: "network" | BotLoginError }
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "waiting" };

/**
The Telegram bot flow: mint a nonce, open the deep link, poll while this screen is
focused. A successful poll stores the token through `Auth`, so the caller only watches
the auth status; the poll is aborted whenever the screen loses focus or unmounts.
*/
export const useBotLogin = (): {
  readonly phase: BotLoginPhase;
  readonly start: () => Promise<void>;
  readonly reset: () => void;
} => {
  const { auth } = useAuth();
  const [phase, setPhase] = useState<BotLoginPhase>({ kind: "idle" });
  const [login, setLogin] = useState<BotLogin | undefined>();
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
    const controller = new AbortController();
    void (async () => {
      const result = await login.waitForToken({
        intervalMs: POLL_INTERVAL_MS,
        signal: controller.signal,
        timeoutMs: POLL_TIMEOUT_MS,
      });
      if (!mountedRef.current || (!result.ok && result.error === "cancelled")) {
        return;
      }
      // On success the auth status flips to signed-in and the screen redirects.
      setLogin(undefined);
      setPhase(result.ok ? { kind: "idle" } : { error: result.error, kind: "error" });
    })();
    return () => {
      controller.abort();
    };
  }, [login]);
  useFocusEffect(poll);

  const start = useCallback(async () => {
    setPhase({ kind: "starting" });
    try {
      const created = await auth.startBotLogin();
      await openURL(created.deepLink);
      setLogin(created);
      setPhase({ kind: "waiting" });
    } catch {
      setPhase({ error: "network", kind: "error" });
    }
  }, [auth]);

  const reset = useCallback(() => {
    setLogin(undefined);
    setPhase({ kind: "idle" });
  }, []);

  return { phase, reset, start };
};
