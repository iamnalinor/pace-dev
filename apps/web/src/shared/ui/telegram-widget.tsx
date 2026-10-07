import { useEffect, useRef, useState } from "react";

import type { TelegramLogin } from "@pace/core";

import { takePendingTelegramLogin, telegramAuthUrl } from "#web/shared/auth/telegram-return.ts";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
/** After this long without the button, say so: telegram.org is slow from some networks. */
export const SLOW_AFTER_MS = 4000;

type Phase = "failed" | "loading" | "ready" | "slow";

type Props = {
  readonly botUsername: string;
  /** Accessible name for the button iframe the script injects (it ships without one). */
  readonly label: string;
  readonly onAuth: (user: TelegramLogin) => void;
  /** Copy for the three states before the button is on screen. */
  readonly texts: {
    readonly loading: string;
    readonly slow: string;
    readonly failed: string;
  };
};

/** The official loader tag; the script replaces it with the button iframe. */
const createWidgetScript = (botUsername: string, authUrl: string): HTMLScriptElement => {
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
  // Lets tests reach the loader tag without walking the DOM.
  script.dataset["testid"] = "telegram-widget-script";
  return script;
};

/**
The injected iframe has no title; name it so assistive tech and axe know what it is, and
tell the caller once a frame is on screen.
*/
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

const Placeholder = ({ phase, texts }: Pick<Props, "texts"> & { readonly phase: Phase }) => {
  if (phase === "ready") {
    return null;
  }
  const isFailed = phase === "failed";
  return (
    <div
      className="flex min-h-11 flex-col items-center justify-center gap-1 text-center"
      role="status"
    >
      {isFailed ? (
        <p className="text-sm text-warn">{texts.failed}</p>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden="true"
              className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-transparent"
            />
            {texts.loading}
          </p>
          {phase === "slow" && <p className="text-xs text-muted">{texts.slow}</p>}
        </>
      )}
    </div>
  );
};

/**
The official Telegram Login Widget: the script replaces itself with an iframe button; after
a login Telegram redirects to `/auth/telegram`, which hands the signed payload back to this
widget on the page that started the flow. Until the button exists the slot shows
a loading row, then a hint when telegram.org is slow, or an error when the script failed.
*/
export const TelegramWidget = ({ botUsername, label, onAuth, texts }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const host = containerRef.current;
    if (host === null) {
      return;
    }
    const script = createWidgetScript(botUsername, telegramAuthUrl(globalThis.location));
    const onScriptError = (): void => {
      setPhase("failed");
    };
    script.addEventListener("error", onScriptError);
    host.append(script);
    const stopWatching = watchFrames(host, label, () => {
      setPhase("ready");
    });
    const slowTimer = setTimeout(() => {
      setPhase((current) => (current === "loading" ? "slow" : current));
    }, SLOW_AFTER_MS);
    return () => {
      clearTimeout(slowTimer);
      stopWatching();
      script.removeEventListener("error", onScriptError);
      script.remove();
    };
  }, [botUsername, label]);

  return (
    <div className="grid gap-2">
      <Placeholder phase={phase} texts={texts} />
      <div
        className={phase === "ready" ? "flex min-h-11 justify-center" : "flex justify-center"}
        data-testid="telegram-widget"
        ref={containerRef}
      />
    </div>
  );
};
