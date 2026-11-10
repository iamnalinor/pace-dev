import { type ReactNode, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { MessageKey } from "@pace/core";

import { TextField } from "#app/ui/text-field.tsx";

import type { BotLoginPhase, useBotLogin } from "./use-bot-login.ts";

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

/**
Why the login card is back, when the server ended the session (from another device's list, a
Not me, or its expiry): a remote revoke otherwise signed out without a word (QA round 15 L2); or
when another tab of this browser signed out.
*/
export const SignedOutLine = () => {
  const t = useT();
  const { endedElsewhere, endedInAnotherTab } = useAuth();
  // Another tab of this browser signing out is the person's own doing, here (QA round 18 L3).
  const elsewhere = endedElsewhere ? "login.endedElsewhere" : null;
  const reason = endedInAnotherTab ? "login.endedInAnotherTab" : elsewhere;
  return reason === null ? null : (
    <Text
      accessibilityLiveRegion="polite"
      className="text-center font-sans text-footnote text-label-secondary"
      role="status"
    >
      {t(reason)}
    </Text>
  );
};

/**
Why a sign-in failed, in words: not on the list, no connection to the server (a request that never
got an answer, QA PR55-1-07), or anything else.
*/
export const signInErrorKey = (code: string): MessageKey => {
  if (code === "auth/not-allowed") {
    return "login.notAllowed";
  }
  return code === "network" ? "login.offline" : "login.failed";
};

/** A Telegram id is a positive number: anything else is refused here, without a round trip. */
const isTelegramId = (value: string): boolean => /^\d+$/u.test(value);

/**
The dev form (local and e2e builds): Enter in the field signs in as the button does (QA PR55-1-06),
and a failure says why under the field.
*/
export const DevLoginForm = () => {
  const t = useT();
  const { auth } = useAuth();
  const [telegramId, setTelegramId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const id = telegramId.trim();
  const submit = async (): Promise<void> => {
    if (id === "" || isBusy) {
      return;
    }
    if (!isTelegramId(id)) {
      setError("login.devIdInvalid");
      return;
    }
    setError(null);
    setIsBusy(true);
    const result = await auth.loginWithDev(id);
    setIsBusy(false);
    if (!result.ok) {
      setError(signInErrorKey(result.error));
    }
  };
  return (
    <View className="gap-2 rounded-xl border border-separator bg-cell p-4">
      <Text className="font-sans text-caption2 font-normal uppercase tabular-nums text-label-tertiary">
        {t("login.dev")}
      </Text>
      <TextField
        error={error === null ? null : t(error)}
        isLabelHidden
        keyboardType="number-pad"
        label={t("login.devId")}
        onChangeText={setTelegramId}
        onSubmitEditing={() => void submit()}
        placeholder={t("login.devId")}
        purpose="token"
        value={telegramId}
      />
      <Button
        busy={isBusy}
        disabled={id === ""}
        onPress={() => void submit()}
        variant="secondary"
        width="fill"
      >
        {t("login.devSubmit")}
      </Button>
    </View>
  );
};

const Waiting = ({
  onCancel,
  onReopen,
}: {
  readonly onCancel: () => void;
  /** Back from Telegram without pressing Start: the same bot link again. */
  readonly onReopen: (() => void) | null;
}) => {
  const t = useT();
  return (
    <View className="items-center gap-3">
      <ActivityIndicator accessibilityLabel={t("login.waiting")} />
      <Text className="font-sans text-callout font-medium text-label-primary">
        {t("login.waiting")}
      </Text>
      <Text className="text-center font-sans text-footnote text-label-secondary">
        {t("login.botHint")}
      </Text>
      {onReopen === null ? null : (
        <Button onPress={onReopen} variant="secondary" width="fill">
          {t("login.openBotAgain")}
        </Button>
      )}
      <Button onPress={onCancel} variant="plain" width="fill">
        {t("common.cancel")}
      </Button>
    </View>
  );
};

/** Both platforms replace their sign-in choices while the same bot flow is pending. */
export const LoginChoices = ({
  bot,
  children,
}: {
  readonly bot: ReturnType<typeof useBotLogin>;
  readonly children: ReactNode;
}) =>
  bot.phase.kind === "waiting" ? <Waiting onCancel={bot.reset} onReopen={bot.reopen} /> : children;
