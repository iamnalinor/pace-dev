import { useEffect, useRef } from "react";

import type { TelegramLogin } from "@pace/core";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

type Props = {
  readonly botUsername: string;
  /** Accessible name for the button iframe the script injects (it ships without one). */
  readonly label: string;
  readonly onAuth: (user: TelegramLogin) => void;
};

/** The injected iframe has no title; name it so assistive tech and axe know what it is. */
const nameFrames = (host: HTMLElement, label: string): (() => void) => {
  const apply = (): void => {
    for (const frame of host.querySelectorAll("iframe")) {
      frame.title = label;
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
The official Telegram Login Widget: the script replaces itself with an iframe button and
calls `window.onTelegramAuth` with the signed payload.
*/
export const TelegramWidget = ({ botUsername, label, onAuth }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    const host = containerRef.current;
    if (host === null) {
      return;
    }
    // The widget calls a global by the name given in data-onauth; there is no other hook.
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- Telegram widget contract
    globalThis.onTelegramAuth = (user: TelegramLogin) => {
      onAuthRef.current(user);
    };
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.dataset["telegramLogin"] = botUsername;
    script.dataset["size"] = "large";
    script.dataset["radius"] = "10";
    script.dataset["userpic"] = "false";
    script.dataset["requestAccess"] = "write";
    script.dataset["onauth"] = "onTelegramAuth(user)";
    host.append(script);
    const stopNaming = nameFrames(host, label);
    return () => {
      stopNaming();
      script.remove();
      // eslint-disable-next-line unicorn/no-global-object-property-assignment -- Telegram widget contract
      globalThis.onTelegramAuth = undefined;
    };
  }, [botUsername, label]);

  return <div className="flex min-h-11 justify-center" ref={containerRef} />;
};
