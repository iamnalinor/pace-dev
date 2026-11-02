import { Text, View } from "react-native";

import type { AiState } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Chip } from "#app/ui/chip.tsx";
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
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {t("composer.aiCheck", { fields })}
        </Text>
      ) : null}
      {questions.map((question) => (
        <View className="gap-1" key={question.question}>
          <Text className="font-sans text-footnote text-label-primary">{question.question}</Text>
          <View
            accessibilityLabel={t("composer.aiQuestion")}
            className="flex-row flex-wrap gap-2"
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
        <Text
          accessibilityLiveRegion="polite"
          className="px-1 pt-2 font-sans text-caption font-normal text-label-primary"
        >
          {t("composer.aiReadingStatus")}
        </Text>
      );
    }
    case "failed": {
      return (
        <Text className="px-1 pt-2 font-sans text-caption font-normal text-label-tertiary">
          {t("composer.aiFailed")}
        </Text>
      );
    }
    case "unavailable": {
      return (
        <View className="items-start gap-2 px-1 pt-2">
          <Text className="font-sans text-caption font-normal text-label-primary">
            {state.retryAt === null
              ? t("composer.aiUnavailableSoon")
              : t("composer.aiUnavailable", { time: clockTime(state.retryAt, viewer.deviceTz) })}
          </Text>
          <Chip onPress={onLater} selected={false}>
            {t("composer.aiLater")}
          </Chip>
        </View>
      );
    }
    case "read": {
      return <Reading onAnswer={onAnswer} reading={state.reading} />;
    }
  }
};
