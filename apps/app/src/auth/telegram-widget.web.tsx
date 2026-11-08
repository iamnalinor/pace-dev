import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { TelegramLogin } from "@pace/core";

import { takePendingTelegramLogin, telegramAuthUrl } from "./telegram-return.ts";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
/** After this long without the button, say so: telegram.org is slow from some networks. */
const SLOW_AFTER_MS = 4000;

type Props = {
  readonly botUsername: string;
  /** Accessible name for the button iframe the script injects (it ships without one). */
  readonly label: string;
  readonly onAuth: (user: TelegramLogin) => void;
  /** The button could not load (its script failed): the page makes another way in the main one. */
  readonly onFailed?: (() => void) | undefined;
  readonly texts: { readonly loading: string; readonly slow: string; readonly failed: string };
};

/** The official loader tag; the script replaces it with the button iframe. */
const widgetScript = (botUsername: string, authUrl: string): HTMLScriptElement => {
  const script = document.createElement("script");
  script.src = WIDGET_SRC;
  script.async = true;
  script.dataset["telegramLogin"] = botUsername;
  script.dataset["size"] = "large";
  script.dataset["radius"] = "10";
  script.dataset["userpic"] = "false";
  script.dataset["requestAccess"] = "write";
  // Redirect mode: `data-onauth` would make the script eval a string, which the CSP forbids.
  script.dataset["authUrl"] = authUrl;
  return script;
};

/** Names the injected iframe for assistive tech, and reports once a frame is on screen. */
const watchFrames = (host: HTMLElement, label: string, onFrame: () => void): (() => void) => {
  const apply = (): void => {
    const frames = host.querySelectorAll("iframe");
    for (const frame of frames) {
      frame.title = label;
      // Whatever the frame loads (Telegram's button, its error, a network's block page) stays
      // inside the widget's own box (owner bug 2026-11-03).
      frame.style.maxWidth = "100%";
    }
    if (frames.length > 0) {
      onFrame();
    }
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(host, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
  };
};

/**
The Telegram Login Widget (web only): after a login Telegram redirects to `/auth/telegram`,
which hands the signed payload back to this widget on the page that started the flow.
*/
export const TelegramWidget = ({ botUsername, label, onAuth, onFailed, texts }: Props) => {
  type Phase = "failed" | "loading" | "ready" | "slow";
  const hostRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  const onFailedRef = useRef(onFailed);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    onAuthRef.current = onAuth;
    onFailedRef.current = onFailed;
  }, [onAuth, onFailed]);

  // Coming back from Telegram's redirect: finish the login the return page stored.
  useEffect(() => {
    const pending = takePendingTelegramLogin();
    if (pending !== null) {
      onAuthRef.current(pending);
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const script = widgetScript(botUsername, telegramAuthUrl(globalThis.location));
    const onError = (): void => {
      setPhase("failed");
      onFailedRef.current?.();
    };
    script.addEventListener("error", onError);
    host.append(script);
    const stopWatching = watchFrames(host, label, () => {
      setPhase("ready");
    });
    const slow = setTimeout(() => {
      setPhase((current) => (current === "loading" ? "slow" : current));
    }, SLOW_AFTER_MS);
    return () => {
      clearTimeout(slow);
      stopWatching();
      script.removeEventListener("error", onError);
      script.remove();
    };
  }, [botUsername, label]);

  return (
    <View className="w-full items-center justify-center gap-1">
      {phase === "failed" ? (
        <Text className="font-sans text-footnote text-danger">{texts.failed}</Text>
      ) : null}
      {phase === "loading" || phase === "slow" ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator accessibilityLabel={texts.loading} size="small" />
          <Text className="font-sans text-footnote text-label-secondary">{texts.loading}</Text>
        </View>
      ) : null}
      {phase === "slow" ? (
        <Text className="font-sans text-caption font-normal text-label-tertiary">{texts.slow}</Text>
      ) : null}
      {/* The frame's own box: as wide as the card, clipped, so it never overlaps what follows. */}
      <View className="min-h-hit-web w-full items-center justify-center overflow-hidden">
        <div
          data-testid="telegram-widget"
          ref={hostRef}
          style={{ display: "flex", justifyContent: "center", maxWidth: "100%" }}
        />
      </View>
    </View>
  );
};
