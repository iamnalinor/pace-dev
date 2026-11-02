import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { formatRelativeDay, type Language } from "@pace/core";

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
        mono
          ? "font-sans text-[12px] tabular-nums text-fg"
          : "flex-shrink font-sans text-[13px] text-fg"
      }
    >
      {value}
    </Text>
  </View>
);

/** The calendar day of an instant in a zone, as `2026-10-31`. */
const dayIn = (at: string, tz: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(at));

/** When it happened: the time alone today, the day named before it on any other day. */
const happenedText = (
  at: string,
  { language, now, tz }: { readonly language: Language; readonly now: string; readonly tz: string },
): string =>
  dayIn(at, tz) === dayIn(now, tz)
    ? clockTime(at, tz)
    : `${formatRelativeDay(at, now, { language, tz })} ${clockTime(at, tz)}`;

/** What will be recorded: the outcome, what stays open, and recorded-vs-happened times. */
export const ClosePreview = ({
  form,
  view,
}: {
  readonly form: CloseForm;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  const { deviceTz, language, now } = useViewer();
  const open = form.mode === "submit" ? stillOpen(view) : [];
  const isLate = isLatePreview(view, form.mode, form.at ?? now);
  const deadlineTiming = isLate ? "close.late" : "close.beforeDeadline";
  // Without a deadline there is nothing to be early or late for.
  const timing = t(view.stats.dueAt === null ? "outcome.done" : deadlineTiming);
  const outcome = form.mode === "other" ? t(`close.${form.outcome}`) : timing;
  // Its day too when it is not today: "yesterday 18:00", "Oct 31 09:30" (QA round 20 L5).
  const happened = form.at === null ? "—" : happenedText(form.at, { language, now, tz: deviceTz });
  const recorded = clockTime(now, deviceTz);
  const isSameMinute =
    form.at !== null &&
    Math.floor(Date.parse(form.at) / 60_000) === Math.floor(Date.parse(now) / 60_000);
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
        value={
          isSameMinute
            ? t("close.recordedOnly", { recorded })
            : t("close.recordedAt", { happened, recorded })
        }
      />
    </View>
  );
};
