import { Text, View } from "react-native";

import type { AiState } from "@pace/client/react";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Chip } from "#app/ui/chip.tsx";

type Props = {
  readonly state: AiState;
  /** An answer to one of the assistant's questions goes into the line. */
  readonly onAnswer: (answer: string) => void;
};

/** What the assistant made of the line: done (and what to check), its questions, or why not. */
export const AiStatus = ({ onAnswer, state }: Props) => {
  const t = useT();
  const viewer = useViewer();
  switch (state.status) {
    case "idle":
    case "reading": {
      return null;
    }
    case "failed": {
      return (
        <Text className="px-1 pt-2 font-sans text-[12px] text-muted">{t("composer.aiFailed")}</Text>
      );
    }
    case "unavailable": {
      return (
        <Text className="px-1 pt-2 font-sans text-[12px] text-fg">
          {state.retryAt === null
            ? t("composer.aiUnavailableSoon")
            : t("composer.aiUnavailable", { time: clockTime(state.retryAt, viewer.deviceTz) })}
        </Text>
      );
    }
    case "read": {
      const { doubtful, questions } = state.reading;
      const fields = doubtful.map((field) => t(`parseField.${field}`)).join(", ");
      return (
        <View className="gap-2 px-1 pt-2">
          <Text className="font-sans text-[12px] text-muted">
            {t("composer.aiRead")}
            {doubtful.length > 0 ? ` ${t("composer.aiCheck", { fields })}` : ""}
          </Text>
          {questions.map((question) => (
            <View className="gap-1" key={question.question}>
              <Text className="font-sans text-[13px] text-fg">{question.question}</Text>
              <View
                accessibilityLabel={t("composer.aiQuestion")}
                className="flex-row flex-wrap gap-1.5"
              >
                {question.options.map((option) => (
                  <Chip
                    key={option}
                    onPress={() => {
                      onAnswer(option);
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
    }
  }
};
