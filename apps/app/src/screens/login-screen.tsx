import { Redirect } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import { useAuth, useT } from "../app-state.tsx";
import { ServerLine } from "../features/server/server-line.tsx";
import { serverStore, useServerInfo } from "../platform/server-store.ts";
import { isPresent } from "../platform/strings.ts";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";
import { DevLoginForm, errorKey, SignedOutLine, Waiting } from "./login-parts.tsx";
import { useBotLogin } from "./use-bot-login.ts";

const AUTH_RETURN_URL = "pace://auth";

/** Opens the web login in a Custom Tab and returns the token it hands back on `pace://auth`. */
const loginInBrowser = async (webOrigin: string): Promise<string | undefined> => {
  const result = await openAuthSessionAsync(`${webOrigin}/login?return=app`, AUTH_RETURN_URL);
  return result.type === "success"
    ? (new URL(result.url).searchParams.get("token") ?? undefined)
    : undefined;
};

/** Starts a sign-in unless the server and this app do not fit; then the refusal shows instead. */
const useSignInGuard = () => {
  const isIncompatible = useStore(serverStore, (state) => state.status === "incompatible");
  const [isRefused, setIsRefused] = useState(false);
  const guard = (start: () => void) => () => {
    setIsRefused(isIncompatible);
    if (!isIncompatible) {
      start();
    }
  };
  return { guard, isRefused: isRefused && isIncompatible };
};

/** Why a sign-in was refused before it started: the server and this app do not fit. */
const Mismatch = () => {
  const t = useT();
  const reason = useStore(serverStore, (state) => state.reason);
  return (
    <View accessibilityRole="alert" className="gap-1">
      <Text className="text-center font-sans text-[15px] font-medium text-fg">
        {t("server.mismatch")}
      </Text>
      <Text className="text-center font-sans text-[13px] text-warn">
        {t(reason === "client-outdated" ? "server.clientOutdated" : "server.serverOutdated")}
      </Text>
    </View>
  );
};

/** The two ways in: the bot in Telegram, and the server's own web login when it has one. */
const SignInButtons = ({
  bot,
  guard,
  onWeb,
}: {
  readonly bot: ReturnType<typeof useBotLogin>;
  /** Wraps each start: a server this app does not fit refuses it before anything happens. */
  readonly guard: (start: () => void) => () => void;
  readonly onWeb: (webOrigin: string) => Promise<void>;
}) => {
  const t = useT();
  const { loginWebOrigin } = useServerInfo();
  return (
    <View className="gap-3">
      <Button
        busy={bot.phase.kind === "starting"}
        onPress={guard(() => void bot.start())}
        width="fill"
      >
        {t("login.openTelegram")}
      </Button>
      {/* Only the current server's own web app: the token it hands back is sent here. */}
      {loginWebOrigin === null ? null : (
        <Button onPress={guard(() => void onWeb(loginWebOrigin))} variant="secondary" width="fill">
          {t("login.webFallback")}
        </Button>
      )}
    </View>
  );
};

export const LoginScreen = () => {
  const t = useT();
  const { auth, status } = useAuth();
  const bot = useBotLogin();
  const { guard, isRefused } = useSignInGuard();
  const [isWebFailed, setIsWebFailed] = useState(false);

  const loginOnWeb = useCallback(
    async (webOrigin: string) => {
      setIsWebFailed(false);
      const token = await loginInBrowser(webOrigin);
      if (!isPresent(token)) {
        return;
      }
      const result = await auth.adoptToken(token);
      setIsWebFailed(!result.ok);
    },
    [auth],
  );

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
        <SignedOutLine />
      </View>
      {isWaiting ? (
        <Waiting onCancel={bot.reset} onReopen={bot.reopen} />
      ) : (
        <SignInButtons bot={bot} guard={guard} onWeb={loginOnWeb} />
      )}
      {isRefused ? <Mismatch /> : null}
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
      {isWaiting ? null : <ServerLine />}
    </View>
  );
};
