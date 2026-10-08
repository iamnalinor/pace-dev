import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { TelegramLogin } from "@pace/core";

import { takePendingTelegramLogin, telegramAuthUrl } from "./telegram-return.ts";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
/** After this long without the button, say so: telegram.org is slow from some networks. */
const SLOW_AFTER_MS = 4000;

type Phase = "failed" | "loading" | "ready" | "slow";

type Props = {
  readonly botUsername: string;
  /** Accessible name for the button iframe the script injects (it ships without one). */
  readonly label: string;
  readonly onAuth: (user: TelegramLogin) => void;
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
export const TelegramWidget = ({ botUsername, label, onAuth, texts }: Props) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

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
    <View className="min-h-11 items-center justify-center gap-1">
      {phase === "failed" ? (
        <Text className="font-sans text-[13px] text-warn">{texts.failed}</Text>
      ) : null}
      {phase === "loading" || phase === "slow" ? (
        <View accessibilityRole="progressbar" className="flex-row items-center gap-2">
          <ActivityIndicator size="small" />
          <Text className="font-sans text-[13px] text-muted">{texts.loading}</Text>
        </View>
      ) : null}
      {phase === "slow" ? (
        <Text className="font-sans text-[12px] text-muted">{texts.slow}</Text>
      ) : null}
      <div data-testid="telegram-widget" ref={hostRef} style={{ display: "flex" }} />
    </View>
  );
};
