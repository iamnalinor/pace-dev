import { Text, View } from "react-native";

import type { AiState } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ActionChip, Chip } from "#app/ui/chip.tsx";
import { answerText } from "@pace/core";

type Props = {
  readonly state: AiState;
  /** An answer to one of the assistant's questions, its question quoted, goes as a correction. */
  readonly onAnswer: (answer: string) => void;
  /** "Read it when it's back": the server keeps the line and adds it once it can read it. */
  readonly onLater: () => void;
};

/**
What the assistant asks of its reading: the fields to double-check and its questions (the
form's title already says the assistant filled it in).
*/
const Reading = ({
  onAnswer,
  reading,
}: {
  readonly reading: Extract<AiState, { readonly status: "read" }>["reading"];
  readonly onAnswer: (answer: string) => void;
}) => {
  const t = useT();
  const { doubtful, questions } = reading;
  if (doubtful.length === 0 && questions.length === 0) {
    return null;
  }
  const fields = doubtful.map((field) => t(`parseField.${field}`)).join(", ");
  return (
    <View className="gap-2 px-1">
      {doubtful.length > 0 ? (
        <Text className="font-sans text-[12px] text-muted">
          {t("composer.aiCheck", { fields })}
        </Text>
      ) : null}
      {questions.map((question) => (
        <View className="gap-1" key={question.question}>
          <Text className="font-sans text-[13px] text-fg">{question.question}</Text>
          <View
            accessibilityLabel={t("composer.aiQuestion")}
            className="flex-row flex-wrap gap-1.5"
            role="group"
          >
            {question.options.map((option) => (
              <Chip
                key={option}
                onPress={() => {
                  onAnswer(answerText(question.question, option));
                }}
                selected={false}
              >
                {option}
              </Chip>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

/** Why no model read the line, in the words for its reason (bug class 99). */
const unreadText = (
  state: Extract<AiState, { readonly status: "unavailable" }>,
  { deviceTz, t }: { readonly deviceTz: string; readonly t: ReturnType<typeof useT> },
): string => {
  switch (state.reason) {
    case "limited": {
      return state.retryAt === null
        ? t("composer.aiUnavailableSoon")
        : t("composer.aiUnavailable", { time: clockTime(state.retryAt, deviceTz) });
    }
    case "unreachable": {
      return t("composer.aiFailed");
    }
    case "unreadable": {
      return t("composer.aiUnreadable");
    }
    case "off": {
      return t("composer.aiOff");
    }
  }
};

/** What the assistant made of the line: what to check, its questions, or why it could not. */
export const AiStatus = ({ onAnswer, onLater, state }: Props) => {
  const t = useT();
  const viewer = useViewer();
  switch (state.status) {
    // Queued: the composer has cleared and said so in a toast.
    case "idle":
    case "queued": {
      return null;
    }
    case "reading": {
      return (
        <Text accessibilityLiveRegion="polite" className="px-1 pt-2 font-sans text-[12px] text-fg">
          {t("composer.aiReadingStatus")}
        </Text>
      );
    }
    case "failed": {
      return (
        <Text className="px-1 pt-2 font-sans text-[12px] text-muted">{t("composer.aiFailed")}</Text>
      );
    }
    case "unavailable": {
      return (
        <View className="items-start gap-1.5 px-1 pt-2">
          <Text className="font-sans text-[12px] text-fg">
            {unreadText(state, { deviceTz: viewer.deviceTz, t })}
          </Text>
          {state.canReadLater ? (
            <ActionChip onPress={onLater}>{t("composer.aiLater")}</ActionChip>
          ) : null}
        </View>
      );
    }
    case "read": {
      return <Reading onAnswer={onAnswer} reading={state.reading} />;
    }
  }
};
