import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";

import type { CloseForm } from "./use-close-form.ts";

import { isLatePreview, stillOpen } from "./close-model.ts";

const Line = ({
  id,
  label,
  mono = false,
  value,
}: {
  readonly id: string;
  readonly label: string;
  readonly mono?: boolean;
  readonly value: string;
}) => (
  <View className="flex-row justify-between gap-3" testID={`preview-${id}`}>
    <Text className="font-sans text-[13px] text-muted">{label}</Text>
    <Text
      className={
        mono ? "font-mono text-[12px] text-fg" : "flex-shrink font-sans text-[13px] text-fg"
      }
    >
      {value}
    </Text>
  </View>
);

/** What will be recorded: the outcome, what stays open, and recorded-vs-happened times. */
export const ClosePreview = ({
  form,
  view,
}: {
  readonly form: CloseForm;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  const { deviceTz, now } = useViewer();
  const open = form.mode === "submit" ? stillOpen(view) : [];
  const outcome =
    form.mode === "other"
      ? t(`close.${form.outcome}`)
      : t(isLatePreview(view, form.mode, form.at ?? now) ? "close.late" : "close.beforeDeadline");
  const happened = form.at === null ? "—" : clockTime(form.at, deviceTz);
  return (
    <View className="gap-1.5 rounded-lg bg-bg p-3">
      <Line id="outcome" label={t("close.outcome")} value={outcome} />
      {open.length === 0 ? null : (
        <Line id="open" label={t("close.stillOpen")} value={open.join(", ")} />
      )}
      <Line
        id="recorded"
        label={t("close.recorded")}
        mono
        value={t("close.recordedAt", { happened, recorded: clockTime(now, deviceTz) })}
      />
    </View>
  );
};
