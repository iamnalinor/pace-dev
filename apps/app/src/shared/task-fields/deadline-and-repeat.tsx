import type { RepeatChangeProblem } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";

import type { TaskFormValues } from "./task-form-types.ts";

import {
  deadlineChoiceProblem,
  type DeadlineChoiceProblem,
  isDeadlineTypeShown,
} from "./deadline-choice.ts";
import { DeadlinePolicyField } from "./deadline-policy-field.tsx";
import { FormAlert, FormNote } from "./form-alert.tsx";
import { RecurrenceField } from "./recurrence-field.tsx";

const isDueBeforeStart = ({ due, start }: TaskFormValues): boolean =>
  due !== null && start !== null && Date.parse(due.at) < Date.parse(start.at);

/**
A deadline before a start the person chose: a note, never a refusal (a one-off may be written
down late, "задним числом"). A repeat refuses the same under Repeat, so no note then.
*/
export const DueBeforeStartNote = ({
  isStartChosen,
  values,
}: {
  /** Without it, a start in the form counts as chosen (the composer has none until picked). */
  readonly isStartChosen: boolean | undefined;
  readonly values: TaskFormValues;
}) => {
  const t = useT();
  const isChosen = isStartChosen ?? values.start !== null;
  return isChosen && values.recurrence === null && isDueBeforeStart(values) ? (
    <FormNote>{t("form.dueBeforeStartNote")}</FormNote>
  ) : null;
};

/** What a two-stage deadline lacks, in words: the final date is asked for after the due shown. */
const DeadlineAlert = ({
  due,
  problem,
}: {
  readonly due: TaskFormValues["due"];
  readonly problem: DeadlineChoiceProblem;
}) => {
  const t = useT();
  const viewer = useViewer();
  const text = (): string => {
    switch (problem) {
      case "deadline/no-due": {
        return t("form.deadlineNoDue");
      }
      case "deadline/days": {
        return t("form.finalDaysInvalid");
      }
      case "deadline/final-after-due": {
        return due === null
          ? t("form.deadlineNoDue")
          : t("form.finalAfterDue", { due: zonedText({ ...due, mode: "due" }, viewer) });
      }
    }
  };
  return <FormAlert>{text()}</FormAlert>;
};

/**
The deadline type with what is wrong with it right under it (not while its final date is still
being picked), then the repeat with its own refusal under it.
*/
export const DeadlineAndRepeat = ({
  isFinalOpen,
  onChange,
  onFinalOpenChange,
  repeatProblem,
  showDeadlineIssue,
  values,
}: {
  readonly values: TaskFormValues;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  readonly isFinalOpen: boolean;
  readonly onFinalOpenChange: (isOpen: boolean) => void;
  readonly showDeadlineIssue: boolean;
  readonly repeatProblem: null | RepeatChangeProblem;
}) => {
  const deadlineProblem =
    showDeadlineIssue && !isFinalOpen
      ? deadlineChoiceProblem(values.deadlinePolicy, values.due)
      : null;
  return (
    <>
      {isDeadlineTypeShown(values.deadlinePolicy, values.due) ? (
        <DeadlinePolicyField
          isFinalOpen={isFinalOpen}
          onChange={(deadlinePolicy) => {
            onChange({ deadlinePolicy });
          }}
          onFinalOpenChange={onFinalOpenChange}
          value={values.deadlinePolicy}
        />
      ) : null}
      {deadlineProblem === null ? null : (
        <DeadlineAlert due={values.due} problem={deadlineProblem} />
      )}
      <RecurrenceField
        onChange={(recurrence) => {
          onChange({ recurrence });
        }}
        problem={repeatProblem}
        start={values.start}
        value={values.recurrence}
      />
    </>
  );
};
