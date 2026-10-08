import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { TelegramLogin } from "@pace/core";

import { useAuth, useT } from "../app-state.tsx";
import { TelegramWidget } from "../auth/telegram-widget.web.tsx";
import { IS_DEV_LOGIN_ENABLED, TELEGRAM_BOT } from "../platform/api-base.ts";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";
import { DevLoginForm, errorKey, Waiting } from "./login-parts.tsx";
import { useBotLogin } from "./use-bot-login.ts";

/** The Android app opens this page for its browser login and waits on `pace://auth`. */
const APP_RETURN = "pace://auth";

/** Only a same-origin path is trusted: an absolute URL in `?next=` would be an open redirect. */
const safeNext = (value: string | undefined): "/" | (string & {}) =>
  value !== undefined && value.startsWith("/") && !value.startsWith("//") ? value : "/";

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

type Translate = ReturnType<typeof useT>;

/** What went wrong, in words: the Telegram login's error first, else the bot flow's. */
const errorMessage = (
  t: Translate,
  error: null | string,
  phase: ReturnType<typeof useBotLogin>["phase"],
): null | string => {
  if (error === "auth/not-allowed") {
    return t("login.notAllowed");
  }
  if (error !== null) {
    return t("login.failed");
  }
  const botError = errorKey(phase);
  return botError === undefined ? null : t(botError);
};

/** The Telegram button, and the bot deep link for when it cannot load. */
const LoginOptions = ({
  bot,
  onTelegram,
}: {
  readonly bot: ReturnType<typeof useBotLogin>;
  readonly onTelegram: (user: TelegramLogin) => void;
}) => {
  const t = useT();
  return (
    <View className="gap-3">
      <TelegramWidget
        botUsername={TELEGRAM_BOT}
        label={t("login.telegram")}
        onAuth={onTelegram}
        texts={{
          failed: t("login.widgetFailed"),
          loading: t("login.widgetLoading"),
          slow: t("login.widgetSlow"),
        }}
      />
      <Button busy={bot.phase.kind === "starting"} onPress={() => void bot.start()} variant="ghost">
        {t("login.botFallback")}
      </Button>
    </View>
  );
};

/**
The web login: the Telegram widget, the bot deep link as the fallback, and the dev form in
e2e builds. Opened by the phone app (`?return=app`), it hands the token back to the app.
*/
export const LoginScreen = () => {
  const t = useT();
  const { auth, status } = useAuth();
  const bot = useBotLogin();
  const params = useLocalSearchParams<{ next?: string; return?: string }>();
  const [error, setError] = useState<null | string>(null);
  const isForApp = firstOf(params.return) === "app";

  useEffect(() => {
    const token = auth.token();
    if (status === "signed-in" && isForApp && token !== undefined) {
      globalThis.location.assign(`${APP_RETURN}?token=${encodeURIComponent(token)}`);
    }
  }, [auth, isForApp, status]);

  const onTelegram = useCallback(
    (user: TelegramLogin) => {
      void (async () => {
        const result = await auth.loginWithTelegram(user);
        setError(result.ok ? null : result.error);
      })();
    },
    [auth],
  );

  if (status === "signed-in" && !isForApp) {
    return <Redirect href={safeNext(firstOf(params.next))} />;
  }
  const message = errorMessage(t, error, bot.phase);
  const isWaiting = bot.phase.kind === "waiting";
  return (
    <View className="flex-1 items-center justify-center bg-bg px-4">
      <View className="w-full max-w-[400px] gap-6 rounded-2xl border border-line bg-surface px-6 py-8">
        <View className="items-center gap-2">
          <PaceLogo heading={t("login.title")} wordmark={t("app.name")} />
          <Text className="text-center font-sans text-[14px] text-muted">
            {t("login.subtitle")}
          </Text>
        </View>
        {isWaiting ? (
          <Waiting onCancel={bot.reset} />
        ) : (
          <LoginOptions bot={bot} onTelegram={onTelegram} />
        )}
        {message === null ? null : (
          <Text accessibilityRole="alert" className="text-center font-sans text-[13px] text-warn">
            {message}
          </Text>
        )}
        {IS_DEV_LOGIN_ENABLED && !isWaiting ? (
          <DevLoginForm
            onFailure={() => {
              setError("failed");
            }}
          />
        ) : null}
      </View>
    </View>
  );
};
