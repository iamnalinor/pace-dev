import { Pressable, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";

import type { CloseMode } from "./close-model.ts";

import { ClosePreview } from "./close-preview.tsx";
import { GiveUpFields } from "./give-up-fields.tsx";
import { useCloseForm } from "./use-close-form.ts";
import { useSubmitClose } from "./use-submit-close.ts";
import { useSubmitTitle } from "./use-submit-title.ts";
import { WhenPicker } from "./when-picker.tsx";

/**
The Close artboard: when it happened (pills or an exact time), whether that time is exact,
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
      <SwitchRow
        hint={t("close.exactHint")}
        label={t("close.exact")}
        onChange={form.setExact}
        value={form.isExact}
      />
      <ClosePreview form={form} view={view} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button onPress={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
        </View>
        <View className="flex-[2]">
          <Button disabled={form.at === null} onPress={submit}>
            {primary}
          </Button>
        </View>
      </View>
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
