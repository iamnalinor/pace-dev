import { Redirect } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { useAuth, useT } from "../app-state.tsx";
import { WEB_ORIGIN } from "../platform/api-base.ts";
import { isPresent } from "../platform/strings.ts";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";
import { DevLoginForm, errorKey, Waiting } from "./login-parts.tsx";
import { useBotLogin } from "./use-bot-login.ts";

const AUTH_RETURN_URL = "pace://auth";

/** Opens the web login in a Custom Tab and returns the token it hands back on `pace://auth`. */
const loginInBrowser = async (): Promise<string | undefined> => {
  const result = await openAuthSessionAsync(`${WEB_ORIGIN}/login?return=app`, AUTH_RETURN_URL);
  return result.type === "success"
    ? (new URL(result.url).searchParams.get("token") ?? undefined)
    : undefined;
};

export const LoginScreen = () => {
  const t = useT();
  const { auth, status } = useAuth();
  const bot = useBotLogin();
  const [isWebFailed, setIsWebFailed] = useState(false);

  const loginOnWeb = useCallback(async () => {
    setIsWebFailed(false);
    const token = await loginInBrowser();
    if (!isPresent(token)) {
      return;
    }
    const result = await auth.adoptToken(token);
    setIsWebFailed(!result.ok);
  }, [auth]);

  if (status === "signed-in") {
    return <Redirect href="/" />;
  }
  const error = errorKey(bot.phase) ?? (isWebFailed ? "login.failed" : undefined);
  const isWaiting = bot.phase.kind === "waiting";

  return (
    <View className="flex-1 justify-center gap-8 bg-bg px-6">
      <View className="items-center gap-2">
        <PaceLogo heading={t("login.title")} wordmark={t("app.name")} />
        <Text className="text-center font-sans text-[14px] text-muted">{t("login.subtitle")}</Text>
      </View>
      {isWaiting ? (
        <Waiting onCancel={bot.reset} />
      ) : (
        <View className="gap-3">
          <Button busy={bot.phase.kind === "starting"} onPress={() => void bot.start()}>
            {t("login.openTelegram")}
          </Button>
          <Button onPress={() => void loginOnWeb()} variant="secondary">
            {t("login.webFallback")}
          </Button>
        </View>
      )}
      {error === undefined ? null : (
        <Text className="text-center font-sans text-[13px] text-warn">{t(error)}</Text>
      )}
      {__DEV__ && !isWaiting ? (
        <DevLoginForm
          onFailure={() => {
            setIsWebFailed(true);
          }}
        />
      ) : null}
    </View>
  );
};
