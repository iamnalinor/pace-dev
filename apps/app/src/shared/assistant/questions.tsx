import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { answerText, type MessageKey, type ParseQuestion } from "@pace/core";

/**
One of the assistant's questions, its options under it as buttons: a tap sends that answer as
a correction (the question quoted, so the model knows what it answers), the same path as a
typed one. A question without options is answered by typing.
*/
const QuestionBlock = ({
  busy,
  chosen,
  onAnswer,
  question,
}: {
  readonly busy: boolean;
  /** The option just tapped, while the assistant revises with it. */
  readonly chosen: null | string;
  readonly onAnswer: (option: string) => void;
  readonly question: ParseQuestion;
}) => {
  const text = (
    <Text className="font-sans text-[13px] leading-5 text-question">{question.question}</Text>
  );
  if (question.options.length === 0) {
    return text;
  }
  return (
    <View accessibilityLabel={question.question} role="group">
      {text}
      <View className="flex-row flex-wrap gap-x-2">
        {question.options.map((option) => (
          <Pressable
            accessibilityLabel={option}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, selected: option === chosen }}
            className={cx(
              "h-11 justify-center active:opacity-80",
              busy && option !== chosen && "opacity-50",
            )}
            disabled={busy}
            key={option}
            onPress={() => {
              onAnswer(option);
            }}
          >
            <View
              className={cx(
                "h-8 justify-center rounded-pill px-3",
                option === chosen ? "border-2 border-fg bg-raised" : "border border-line bg-bg",
              )}
            >
              <Text className="font-sans text-[13px] text-fg">{option}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

/** A tapped answer: the question it answers and the option chosen. */
type Answered = { readonly question: string; readonly option: string };

/** A question answered by a tap and no longer asked: what was answered stays in view. */
const AnsweredLine = ({ answered }: { readonly answered: Answered }) => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View
      accessibilityLabel={t("assistant.answered", answered)}
      accessible
      className="flex-row items-start gap-1.5"
    >
      <Check color={palette.fg2} size={16} strokeWidth={2} style={{ marginTop: 2 }} />
      <Text className="shrink font-sans text-[13px] leading-5 text-fg2">
        {`${answered.question} — ${answered.option}`}
      </Text>
    </View>
  );
};

/**
How to answer what is open: a tap on an option, typing in the field below (a question without
options), or both. Approve keeps what is shown either way.
*/
const hintOf = (questions: readonly ParseQuestion[]): MessageKey | null => {
  const hasOptions = questions.some((question) => question.options.length > 0);
  const hasTyped = questions.some((question) => question.options.length === 0);
  if (hasOptions && hasTyped) {
    return "assistant.questionsHintBoth";
  }
  if (hasOptions) {
    return "assistant.questionsHint";
  }
  return hasTyped ? "assistant.questionsHintType" : null;
};

/**
The questions still asked, each with its options, and above them those answered by a tap (so the
person sees the answer was taken); the chosen option is marked while the assistant revises.
*/
export const Questions = ({
  busy,
  hasActions,
  onFollowup,
  questions,
}: {
  readonly busy: boolean;
  readonly hasActions: boolean;
  readonly onFollowup: (text: string) => void;
  readonly questions: readonly ParseQuestion[];
}) => {
  const t = useT();
  const [answers, setAnswers] = useState<readonly Answered[]>([]);
  const answer = (question: string, option: string): void => {
    setAnswers((current) => [
      ...current.filter((item) => item.question !== question),
      { option, question },
    ]);
    onFollowup(answerText(question, option));
  };
  const isAsked = (answered: Answered): boolean =>
    questions.some((question) => question.question === answered.question);
  const chosenFor = (question: string): null | string =>
    busy ? (answers.find((item) => item.question === question)?.option ?? null) : null;
  const hint = hasActions ? hintOf(questions) : null;
  return (
    <>
      {answers
        .filter((answered) => !isAsked(answered))
        .map((answered) => (
          <AnsweredLine answered={answered} key={answered.question} />
        ))}
      {questions.map((question) => (
        <QuestionBlock
          busy={busy}
          chosen={chosenFor(question.question)}
          key={question.question}
          onAnswer={(option) => {
            answer(question.question, option);
          }}
          question={question}
        />
      ))}
      {hint === null ? null : (
        <Text className="font-sans text-[13px] leading-5 text-muted">{t(hint)}</Text>
      )}
    </>
  );
};
