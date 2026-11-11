import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Collapse } from "#app/ui/disclosure.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TimeCheckScope, useCheckedSubmit, useTimeChecks } from "#app/ui/time-check.tsx";

import type { CloseMode } from "./close-model.ts";

import { ClosePreview } from "./close-preview.tsx";
import { GiveUpFields, OUTCOMES } from "./give-up-fields.tsx";
import { type CloseForm, useCloseForm } from "./use-close-form.ts";
import { useSubmitClose } from "./use-submit-close.ts";
import { WhenPicker } from "./when-picker.tsx";

/** Exactly or about then: both choices in sight as chips, like the rest of the sheet. */
const PrecisionRow = ({ form }: { readonly form: CloseForm }) => {
  const t = useT();
  return (
    <RadioChips
      choices={[
        { text: t("close.exact"), value: "exact" },
        { text: t("close.approx"), value: "approx" },
      ]}
      label={t("close.precision")}
      onChange={(precision) => {
        form.setIsExact(precision === "exact");
      }}
      tall
      value={form.isExact ? "exact" : "approx"}
    />
  );
};

/**
How the task ends, one choice in sight: Done, Cancelled, Skipped. A choice made by
mistake is undone in the same row, and the row stays where it is, so the focus on it stays in
the sheet (QA round 19 M2, QA round 20 L6 and M2).
*/
const OutcomeRow = ({
  form,
  onReasonWanted,
}: {
  readonly form: CloseForm;
  /** Cancelled or Skipped was pressed (not arrowed onto): the reason is what comes next. */
  readonly onReasonWanted: () => void;
}) => {
  type Outcome = "cancelled" | "first" | "skipped";
  const t = useT();
  return (
    <RadioChips
      choices={[
        { text: t("outcome.done"), value: "first" },
        ...OUTCOMES.map((outcome) => ({ text: t(`close.${outcome}`), value: outcome })),
      ]}
      label={t("close.outcome")}
      onChange={(next: Outcome, via) => {
        if (next === "first") {
          form.setMode("done");
          return;
        }
        form.setOutcome(next);
        form.setMode("other");
        if (via === "press") {
          onReasonWanted();
        }
      }}
      tall
      value={form.mode === "other" ? form.outcome : "first"}
    />
  );
};

/**
The Close artboard: when it happened (pills or an exact time), exactly or about then (two
chips, so both choices are in sight),
a preview of what gets recorded, with how it ends (Done, Cancelled, Skipped) on top.
*/
export const CloseSheet = ({
  onClose,
  startMode,
  view,
}: {
  readonly onClose: () => void;
  /** "Close as…" from the menu opens straight on Cancelled · Skipped. */
  readonly startMode?: CloseMode;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  const { deviceTz, now } = useViewer();
  const form = useCloseForm(view, { deviceTz, now }, startMode);
  const submitClose = useSubmitClose(view, form, onClose);
  const times = useTimeChecks();
  // A time typed and not readable refuses Done, said under its field (R27-01, R27-02); one
  // handed over by the press is closed with (review I3), unless the sheet now refuses it.
  const submit = useCheckedSubmit(times, () => {
    if (form.at !== null && form.problem === null) {
      submitClose();
    }
  });
  // Each press of Cancelled or Skipped asks Reason for the cursor (with a keyboard), as opening
  // on them from "Close as…" does; an arrow moving through the outcomes keeps it in the row
  // (round 7 review 9).
  const [reasonAsked, setReasonAsked] = useState(startMode === "other" ? 1 : 0);
  const primary = {
    done: t("common.done"),
    other: t("close.confirm", { outcome: t(`close.${form.outcome}`) }),
  }[form.mode];
  const whenLabel = { done: t("close.whenDone"), other: t("close.whenClosed") }[form.mode];
  return (
    <Sheet
      closeLabel={t("common.close")}
      // In sight however short the window: the action stays under the scrolling body.
      footer={
        <SheetActions
          isDisabled={form.at === null || form.problem !== null}
          onPrimary={submit}
          primaryLabel={primary}
        />
      }
      name="close"
      onClose={onClose}
      open
      subtitle={view.title}
      title={t("close.closeTitle")}
    >
      <OutcomeRow
        form={form}
        onReasonWanted={() => {
          setReasonAsked((count) => count + 1);
        }}
      />
      {/* The reason grows in and shrinks away: the fields under it never jump (QA 21 L2). */}
      <Collapse open={form.mode === "other"}>
        <GiveUpFields form={form} reasonAsked={reasonAsked} />
      </Collapse>
      <TimeCheckScope checks={times}>
        <WhenPicker
          deviceTz={deviceTz}
          form={form}
          label={whenLabel}
          quickTimes={view.quickTimes}
        />
      </TimeCheckScope>
      <PrecisionRow form={form} />
      <ClosePreview form={form} view={view} />
    </Sheet>
  );
};
