import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppState, useLanguage, useT } from "#app/app-state.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useHotkey } from "#app/ui/use-hotkey.tsx";
import { type Action, detailText, type ParseQuestion, summaryDetails } from "@pace/core";

/**
One action as it will be written: its summary, then what it sets (a new task's category, due,
estimate…; an activity's category and expected length), a field the model only guessed marked.
*/
const ActionCard = ({ action }: { readonly action: Action }) => {
  const language = useLanguage();
  const state = useAppState((current) => current);
  const lines = summaryDetails(action, { language, state });
  return (
    <View
      accessibilityLabel={action.summary}
      className="gap-1 rounded-lg border border-line bg-bg px-3 py-2"
      role="group"
    >
      <Text className="font-sans text-[14px] leading-5 text-fg">{action.summary}</Text>
      {lines.map((line) => (
        <Text
          className={`font-sans text-[13px] leading-5 ${line.isDoubtful ? "text-warn" : "text-fg2"}`}
          key={line.label}
        >
          {detailText(line, language)}
        </Text>
      ))}
    </View>
  );
};

type Props = {
  readonly actions: readonly Action[];
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
  readonly onFollowup: (text: string) => void;
  /** The assistant's questions about what stays unclear: a correction answers them. */
  readonly questions?: readonly ParseQuestion[];
  readonly source?: "parsed" | "unavailable";
};

const NO_QUESTIONS: readonly ParseQuestion[] = [];

/** A correction in plain words: the assistant revises every action with it. */
const CorrectionRow = ({
  busy,
  onFollowup,
}: {
  readonly busy: boolean;
  readonly onFollowup: (text: string) => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const [correction, setCorrection] = useState("");
  const send = (): void => {
    const text = correction.trim();
    if (text === "" || busy) {
      return;
    }
    setCorrection("");
    onFollowup(text);
  };
  return (
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
  );
};

/** An answer stays pending until the person approves its full current set of actions. */
export const ActionCards = ({
  actions,
  busy,
  onApprove,
  onCancel,
  onFollowup,
  questions = NO_QUESTIONS,
  source,
}: Props) => {
  const t = useT();
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
  return (
    <View className="gap-3 rounded-xl border border-line bg-surface p-3">
      {source === "unavailable" ? (
        <Text className="font-sans text-[13px] leading-5 text-muted">
          {t("assistant.rulesUsed")}
        </Text>
      ) : null}
      {actions.map((action, index) => (
        <ActionCard action={action} key={`${action.kind}:${String(index)}`} />
      ))}
      {questions.map((question) => (
        <Text className="font-sans text-[13px] leading-5 text-question" key={question.question}>
          {question.question}
        </Text>
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
      <CorrectionRow busy={busy} onFollowup={onFollowup} />
    </View>
  );
};
