import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { Action } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useHotkey } from "#app/ui/use-hotkey.tsx";

type Props = {
  readonly actions: readonly Action[];
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
  readonly onFollowup: (text: string) => void;
  readonly source?: "parsed" | "unavailable";
};

/** An answer stays pending until the person approves its full current set of actions. */
export const ActionCards = ({ actions, busy, onApprove, onCancel, onFollowup, source }: Props) => {
  const t = useT();
  const { palette } = useTheme();
  const [correction, setCorrection] = useState("");
  useHotkey(HOTKEYS.enter, () => {
    if (!busy && actions.length > 0) {
      onApprove();
    }
  });
  useHotkey(HOTKEYS.primary, () => {
    if (!busy && actions.length > 0) {
      onApprove();
    }
  });
  useHotkey(HOTKEYS.escape, onCancel);
  const send = (): void => {
    const text = correction.trim();
    if (text === "" || busy) {
      return;
    }
    setCorrection("");
    onFollowup(text);
  };
  return (
    <View className="gap-3 rounded-xl border border-line bg-surface p-3">
      {source === "unavailable" ? (
        <Text className="font-sans text-[13px] leading-5 text-muted">
          {t("assistant.rulesUsed")}
        </Text>
      ) : null}
      {actions.map((action, index) => (
        <View
          className="rounded-lg border border-line bg-bg px-3 py-2"
          key={`${action.kind}:${String(index)}`}
        >
          <Text className="font-sans text-[14px] leading-5 text-fg">{action.summary}</Text>
        </View>
      ))}
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          className="min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-3"
          disabled={busy || actions.length === 0}
          onPress={onApprove}
        >
          <Text className="font-sans font-medium text-accentFg">{t("assistant.approve")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-lg border border-line px-3"
          disabled={busy}
          onPress={onCancel}
        >
          <Text className="font-sans text-fg">{t("assistant.cancel")}</Text>
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        <TextInput
          accessibilityLabel={t("assistant.correct")}
          className="min-h-11 flex-1 rounded-lg border border-line bg-bg px-3 font-sans text-fg"
          editable={!busy}
          onChangeText={setCorrection}
          onSubmitEditing={send}
          placeholder={t("assistant.correct")}
          placeholderTextColor={palette.muted}
          value={correction}
        />
        <Pressable
          accessibilityLabel={t("assistant.sendCorrection")}
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-lg border border-line px-3"
          disabled={busy || correction.trim() === ""}
          onPress={send}
        >
          <Text className="font-sans text-fg">↵</Text>
        </Pressable>
      </View>
    </View>
  );
};
