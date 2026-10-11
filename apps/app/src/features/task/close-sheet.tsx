import { Pressable, Text } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { OptionRow } from "#app/shared/task-fields/option-row.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Chip } from "#app/ui/chip.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";

import type { CloseMode } from "./close-model.ts";

import { ClosePreview } from "./close-preview.tsx";
import { GiveUpFields } from "./give-up-fields.tsx";
import { type CloseForm, useCloseForm } from "./use-close-form.ts";
import { useSubmitClose } from "./use-submit-close.ts";
import { useSubmitTitle } from "./use-submit-title.ts";
import { WhenPicker } from "./when-picker.tsx";

/** Exactly or about then: both choices in sight as chips, like the rest of the sheet. */
const PrecisionRow = ({ form }: { readonly form: CloseForm }) => {
  const t = useT();
  return (
    <OptionRow label={t("close.precision")}>
      {([true, false] as const).map((isExact) => (
        <Chip
          key={String(isExact)}
          onPress={() => {
            form.setIsExact(isExact);
          }}
          selected={form.isExact === isExact}
          tall
        >
          {t(isExact ? "close.exact" : "close.approx")}
        </Chip>
      ))}
    </OptionRow>
  );
};

/**
The Close artboard: when it happened (pills or an exact time), exactly or about then (two
chips, so both choices are in sight),
a preview of what gets recorded, and the way out ("Close task as… Cancelled · Skipped").
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
  const { deviceTz } = useViewer();
  const form = useCloseForm(view, deviceTz, startMode);
  const submitTitle = useSubmitTitle(view);
  const submit = useSubmitClose(view, form, onClose);
  const isSubmit = form.mode === "submit";
  const primary = {
    done: t("common.done"),
    other: t("close.confirm", { outcome: t(`close.${form.outcome}`) }),
    submit: t("close.submit"),
  }[form.mode];
  const whenLabel = {
    done: t("close.whenDone"),
    other: t("close.whenClosed"),
    submit: t("close.whenSubmitted"),
  }[form.mode];
  return (
    <Sheet
      closeLabel={t("common.close")}
      onClose={onClose}
      subtitle={isSubmit ? t("close.subtitleSolved", { title: view.title }) : view.title}
      title={isSubmit ? submitTitle : t("close.closeTitle")}
      visible
    >
      {form.mode === "other" ? <GiveUpFields form={form} /> : null}
      <WhenPicker deviceTz={deviceTz} form={form} label={whenLabel} quickTimes={view.quickTimes} />
      <PrecisionRow form={form} />
      <ClosePreview form={form} view={view} />
      <SheetActions isDisabled={form.at === null} onPrimary={submit} primaryLabel={primary} />
      {form.mode === "other" ? null : (
        <Pressable
          accessibilityRole="button"
          className="h-11 items-center justify-center"
          onPress={() => {
            form.setMode("other");
          }}
        >
          <Text className="font-sans text-[13px] text-muted">{t("close.other")}</Text>
        </Pressable>
      )}
    </Sheet>
  );
};
