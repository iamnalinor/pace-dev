import { Redirect } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useAuth, useT } from "../app-state.tsx";
import { WEB_ORIGIN } from "../platform/api-base.ts";
import { isPresent } from "../platform/strings.ts";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";
import { type BotLoginPhase, useBotLogin } from "./use-bot-login.ts";

const AUTH_RETURN_URL = "pace://auth";

const errorKey = (phase: BotLoginPhase): MessageKey | undefined => {
  if (phase.kind !== "error") {
    return undefined;
  }
  switch (phase.error) {
    case "not-allowed": {
      return "login.notAllowed";
    }
    case "timeout": {
      return "login.timeout";
    }
    case "cancelled":
    case "network": {
      return "login.failed";
    }
  }
};

/** Opens the web login in a Custom Tab and returns the token it hands back on `pace://auth`. */
const loginInBrowser = async (): Promise<string | undefined> => {
  const result = await openAuthSessionAsync(`${WEB_ORIGIN}/login?return=app`, AUTH_RETURN_URL);
  return result.type === "success"
    ? (new URL(result.url).searchParams.get("token") ?? undefined)
    : undefined;
};

const DevLoginForm = ({ onFailure }: { readonly onFailure: () => void }) => {
  const t = useT();
  const { auth } = useAuth();
  const [telegramId, setTelegramId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const submit = async (): Promise<void> => {
    setIsBusy(true);
    const result = await auth.loginWithDev(telegramId.trim());
    setIsBusy(false);
    if (!result.ok) {
      onFailure();
    }
  };
  return (
    <View className="gap-2 rounded-xl border border-line bg-surface p-4">
      <Text className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {t("login.dev")}
      </Text>
      <TextInput
        accessibilityLabel={t("login.devId")}
        autoCapitalize="none"
        className="h-12 rounded-md bg-raised px-3 font-mono text-[15px] text-fg"
        keyboardType="number-pad"
        onChangeText={setTelegramId}
        placeholder={t("login.devId")}
        value={telegramId}
      />
      <Button
        busy={isBusy}
        disabled={telegramId.trim() === ""}
        onPress={() => void submit()}
        variant="secondary"
      >
        {t("login.devSubmit")}
      </Button>
    </View>
  );
};

const Waiting = ({ onCancel }: { readonly onCancel: () => void }) => {
  const t = useT();
  return (
    <View className="items-center gap-3">
      <ActivityIndicator />
      <Text className="font-sans text-[15px] font-medium text-fg">{t("login.waiting")}</Text>
      <Text className="text-center font-sans text-[13px] text-muted">{t("login.botHint")}</Text>
      <Button onPress={onCancel} variant="ghost">
        {t("common.cancel")}
      </Button>
    </View>
  );
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
        <PaceLogo wordmark={t("app.name")} />
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
