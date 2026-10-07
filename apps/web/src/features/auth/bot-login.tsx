import { useEffect, useRef, useState } from "react";

import type { BotLoginError, BotLogin as BotLoginSession } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";

const TIMEOUT_MS = 5 * 60_000;

type Props = {
  readonly pollIntervalMs: number;
  readonly onError: (error: "network" | BotLoginError) => void;
};

/** The deep-link flow: open the bot, press Start, the page polls until the nonce is bound. */
export const BotLogin = ({ onError, pollIntervalMs }: Props) => {
  const t = useT();
  const { auth, botUsername } = useServices();
  const [session, setSession] = useState<BotLoginSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      const result = await session.waitForToken({
        intervalMs: pollIntervalMs,
        signal: controller.signal,
        timeoutMs: TIMEOUT_MS,
      });
      if (result.ok || result.error === "cancelled") {
        return;
      }

      setSession(null);
      onError(result.error);
    })();
    return () => {
      controller.abort();
    };
  }, [session, pollIntervalMs, onError]);

  const start = async (): Promise<void> => {
    try {
      setSession(await auth.startBotLogin());
    } catch {
      onError("network");
    }
  };

  if (session === null) {
    return (
      <Button className="w-full" onClick={start} variant="link">
        {t("login.botFallback")}
      </Button>
    );
  }
  return (
    <div className="grid gap-3 text-center">
      <Button asChild variant="outline">
        <a href={session.deepLink} rel="noreferrer" target="_blank">
          {t("login.openBot", { bot: `@${botUsername}` })}
        </a>
      </Button>
      <p className="text-sm text-muted">{t("login.botHint")}</p>
      <p aria-live="polite" className="font-mono text-xs text-muted">
        {t("login.waiting")}
      </p>
      <Button
        onClick={() => {
          abortRef.current?.abort();
          setSession(null);
        }}
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
};
