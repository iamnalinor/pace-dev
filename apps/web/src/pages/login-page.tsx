import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useAuth, useServices } from "#web/app-state.tsx";
import { BotLogin } from "#web/features/auth/bot-login.tsx";
import { DevLogin } from "#web/features/auth/dev-login.tsx";
import { TelegramWidget } from "#web/features/auth/telegram-widget.tsx";
import { useT } from "#web/i18n.tsx";
import { IS_DEV_LOGIN_ENABLED } from "#web/platform/api-base.ts";
import { Card } from "#web/shared/ui/card.tsx";
import { PaceMark } from "#web/shared/ui/pace-mark.tsx";

const DEFAULT_POLL_MS = 2000;

/** Maps an auth error code to the message key shown under the card. */
const errorKey = (code: string): "login.failed" | "login.notAllowed" | "login.timeout" => {
  switch (code) {
    case "auth/not-allowed":
    case "not-allowed": {
      return "login.notAllowed";
    }
    case "timeout": {
      return "login.timeout";
    }
    default: {
      return "login.failed";
    }
  }
};

/** Only the destination path is trusted: an absolute URL in ?next= would be an open redirect. */
const safeNext = (value: null | string): string =>
  value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/";

export const LoginPage = ({ pollIntervalMs = DEFAULT_POLL_MS }: { pollIntervalMs?: number }) => {
  const t = useT();
  const { auth, status } = useAuth();
  const { botUsername } = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<null | string>(null);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (status === "signed-in") {
      void navigate(next, { replace: true });
    }
  }, [status, next, navigate]);

  const onError = useCallback((code: string) => {
    setError(code);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-4 py-8">
      <Card className="grid gap-6 px-6 py-8">
        <div className="flex items-center gap-3">
          <PaceMark className="size-10" />
          <span className="text-2xl font-semibold tracking-[-0.04em]">{t("app.name")}</span>
        </div>
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("login.title")}</h1>
          <p className="text-sm text-muted">{t("login.subtitle")}</p>
        </div>
        <TelegramWidget
          botUsername={botUsername}
          onAuth={(user) => {
            void (async () => {
              const result = await auth.loginWithTelegram(user);
              if (!result.ok) {
                setError(result.error);
              }
            })();
          }}
        />
        <BotLogin onError={onError} pollIntervalMs={pollIntervalMs} />
        {error !== null && (
          <p className="text-sm text-warn" role="alert">
            {t(errorKey(error))}
          </p>
        )}
        {IS_DEV_LOGIN_ENABLED && <DevLogin onError={onError} />}
      </Card>
    </main>
  );
};
