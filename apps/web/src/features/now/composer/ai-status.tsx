import type { AiState } from "@pace/client/react";
import type { ParseQuestion } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatTime } from "#web/shared/format/time.ts";
import { chipClass } from "#web/shared/ui/chip-group.tsx";

type Props = {
  readonly state: AiState;
  /** Enter was pressed on a long text: it waits for the reading. */
  readonly isWaiting: boolean;
  /** An answer to one of the assistant's questions goes into the line. */
  readonly onAnswer: (answer: string) => void;
};

const Questions = ({
  onAnswer,
  questions,
}: {
  readonly questions: readonly ParseQuestion[];
  readonly onAnswer: (answer: string) => void;
}) => {
  const t = useT();
  return questions.map((question) => (
    <div className="grid gap-1" key={question.question}>
      <p className="text-[13px] text-fg">{question.question}</p>
      <div aria-label={t("composer.aiQuestion")} className="flex flex-wrap gap-1.5" role="group">
        {question.options.map((option) => (
          <button
            className={chipClass(false)}
            key={option}
            onClick={() => {
              onAnswer(option);
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  ));
};

/** What the assistant made of the line: done (and what to check), its questions, or why not. */
export const AiStatus = ({ isWaiting, onAnswer, state }: Props) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz } = useServices().hooks.useClock();
  switch (state.status) {
    case "idle": {
      return null;
    }
    case "reading": {
      return (
        <p className="animate-pulse px-1 text-[13px] text-fg" role="status">
          {t(isWaiting ? "composer.aiWaiting" : "composer.aiReadingStatus")}
        </p>
      );
    }
    case "failed": {
      return (
        <p className="px-1 text-[13px] text-muted" role="status">
          {t("composer.aiFailed")}
        </p>
      );
    }
    case "unavailable": {
      return (
        <p className="px-1 text-[13px] text-fg" role="status">
          {state.retryAt === null
            ? t("composer.aiUnavailableSoon")
            : t("composer.aiUnavailable", { time: formatTime(state.retryAt, deviceTz, language) })}
        </p>
      );
    }
    case "read": {
      const { doubtful, questions } = state.reading;
      const fields = doubtful.map((field) => t(`parseField.${field}`)).join(", ");
      return (
        <div className="grid gap-2 px-1" role="status">
          <p className="text-[13px] text-muted">
            {t("composer.aiRead")}
            {doubtful.length > 0 && (
              <span className="font-medium text-fg"> {t("composer.aiCheck", { fields })}</span>
            )}
          </p>
          <Questions onAnswer={onAnswer} questions={questions} />
        </div>
      );
    }
  }
};
