import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppState, useLanguage, useT } from "#app/app-state.tsx";
import { Questions } from "#app/shared/assistant/questions.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { KeyHint } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
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
  const { now } = useViewer();
  const state = useAppState((current) => current);
  const lines = summaryDetails(action, { language, now, state });
  return (
    <View
      accessibilityLabel={action.summary}
      className="gap-1 rounded-lg border border-separator bg-app px-3 py-2"
      role="group"
    >
      <Text className="font-sans text-subhead font-normal text-label-primary">
        {action.summary}
      </Text>
      {lines.map((line) => (
        <Text
          className={`font-sans text-footnote ${line.isDoubtful ? "text-warn" : "text-label-secondary"}`}
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
  /** The assistant's questions about what stays unclear: an option or a correction answers them. */
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
    <View className={cx("flex-row gap-2", busy && "opacity-50")}>
      <TextInput
        accessibilityLabel={t("assistant.correct")}
        className="min-h-hit-web flex-1 rounded-lg border border-outline bg-app px-3 font-sans text-label-primary"
        editable={!busy}
        onChangeText={setCorrection}
        onSubmitEditing={send}
        placeholder={t("assistant.correct")}
        placeholderTextColor={palette["label.tertiary"]}
        value={correction}
      />
      <Pressable
        accessibilityLabel={t("assistant.sendCorrection")}
        accessibilityRole="button"
        className="min-h-hit-web items-center justify-center rounded-lg border border-outline px-3"
        disabled={busy || correction.trim() === ""}
        onPress={send}
      >
        <Text className="font-sans text-label-primary">↵</Text>
      </Pressable>
    </View>
  );
};

/** Approve (Enter) and Cancel (Esc), their keys shown with a keyboard, dimmed while busy. */
const CardButtons = ({
  busy,
  canApprove,
  onApprove,
  onCancel,
}: {
  readonly busy: boolean;
  readonly canApprove: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row gap-2">
      <Pressable
        accessibilityLabel={t("assistant.approve")}
        accessibilityRole="button"
        className={cx(
          "min-h-hit-web flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-accent px-3",
          !canApprove && "opacity-50",
        )}
        disabled={!canApprove}
        onPress={onApprove}
      >
        <Text className="font-sans font-medium text-accent-on">{t("assistant.approve")}</Text>
        <KeyHint hotkey={HOTKEYS.enter} variant="primary" />
      </Pressable>
      <Pressable
        accessibilityLabel={t("common.cancel")}
        accessibilityRole="button"
        className={cx(
          "min-h-hit-web flex-row items-center justify-center gap-2 rounded-lg border border-outline px-3",
          busy && "opacity-50",
        )}
        disabled={busy}
        onPress={onCancel}
      >
        <Text className="font-sans text-label-primary">{t("common.cancel")}</Text>
        <KeyHint hotkey={HOTKEYS.escape} variant="secondary" />
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
  const canApprove = !busy && actions.length > 0;
  const approve = (): void => {
    if (canApprove) {
      onApprove();
    }
  };
  useHotkey(HOTKEYS.enter, approve);
  useHotkey(HOTKEYS.primary, approve);
  useHotkey(HOTKEYS.escape, onCancel);
  return (
    <View className="gap-3 rounded-xl border border-separator bg-cell p-3">
      {source === "unavailable" ? (
        <Text className="font-sans text-footnote text-label-secondary">
          {t("assistant.rulesUsed")}
        </Text>
      ) : null}
      {actions.map((action, index) => (
        <ActionCard action={action} key={`${action.kind}:${String(index)}`} />
      ))}
      <Questions
        busy={busy}
        hasActions={actions.length > 0}
        onFollowup={onFollowup}
        questions={questions}
      />
      <CardButtons busy={busy} canApprove={canApprove} onApprove={onApprove} onCancel={onCancel} />
      <CorrectionRow busy={busy} onFollowup={onFollowup} />
    </View>
  );
};
