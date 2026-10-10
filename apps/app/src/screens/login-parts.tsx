import { useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import type { MessageKey } from "@pace/core";

import type { BotLoginPhase } from "./use-bot-login.ts";

import { useAuth, useT } from "../app-state.tsx";
import { Button } from "../ui/button.tsx";

/** Pieces both login screens share (the phone's and the web's). */

export const errorKey = (phase: BotLoginPhase): MessageKey | undefined => {
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

export const DevLoginForm = ({ onFailure }: { readonly onFailure: () => void }) => {
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
      <Text className="font-sans text-[11px] uppercase tabular-nums tracking-[0.06em] text-muted">
        {t("login.dev")}
      </Text>
      <TextInput
        accessibilityLabel={t("login.devId")}
        autoCapitalize="none"
        className="h-12 rounded-md bg-raised px-3 font-sans text-[15px] tabular-nums text-fg"
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

export const Waiting = ({ onCancel }: { readonly onCancel: () => void }) => {
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
