import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { SubtaskRow, TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

const weekday = (atIso: string, tz: string, language: string): string =>
  new Intl.DateTimeFormat(language, { timeZone: tz, weekday: "short" }).format(new Date(atIso));

const Mark = ({ state }: { readonly state: SubtaskRow["state"] }) => {
  const { palette } = useTheme();
  return (
    <View
      className={cx(
        "h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px]",
        state === "pending" ? "border-muted" : "border-fg bg-fg",
        state === "submitted" && "opacity-50",
      )}
    >
      {state === "pending" ? null : <Check color={palette.bg} size={14} strokeWidth={2.5} />}
    </View>
  );
};

const SubtaskItem = ({
  subtask,
  taskId,
}: {
  readonly subtask: SubtaskRow;
  readonly taskId: string;
}) => {
  const t = useT();
  const { deviceTz, language } = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  const isSent = subtask.state === "submitted";
  const note = (): string => {
    if (subtask.submittedAt !== null) {
      return t("task.subtaskSent", { when: weekday(subtask.submittedAt, deviceTz, language) });
    }
    return subtask.state === "solved" ? t("task.subtaskSolved") : "";
  };
  return (
    <Pressable
      accessibilityLabel={subtask.label}
      accessibilityRole="checkbox"
      aria-checked={subtask.state !== "pending"}
      aria-disabled={isSent}
      className="min-h-[52px] flex-row items-center gap-3 border-b border-line px-1 active:opacity-70"
      disabled={isSent}
      onPress={() => {
        void run(
          subtask.state === "pending"
            ? actions.markSolved(taskId, subtask.id)
            : actions.unmarkSolved(taskId, subtask.id),
        );
      }}
    >
      <Mark state={subtask.state} />
      {/* A bare number label ("290") is the number itself: shown once, in the label. */}
      {subtask.number === null || String(subtask.number) === subtask.label ? null : (
        <Text className="min-w-8 font-sans text-[13px] tabular-nums text-muted">
          {`№${String(subtask.number)}`}
        </Text>
      )}
      <Text className={cx("flex-1 font-sans text-[15px]", isSent ? "text-muted" : "text-fg")}>
        {subtask.label}
      </Text>
      <Text className="font-sans text-[12px] text-muted">{note()}</Text>
    </Pressable>
  );
};

/** The subtasks with their states; a tap marks one solved or takes that back (not once sent). */
export const SubtaskChecklist = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  if (view.subtasks.length === 0) {
    return null;
  }
  const solved = view.subtasks.filter((subtask) => subtask.state !== "pending").length;
  const sent = view.subtasks.filter((subtask) => subtask.state === "submitted").length;
  return (
    <View className="px-4">
      <View className="flex-row items-baseline justify-between px-1 pb-1">
        <Text accessibilityRole="header" className="font-sans text-[12px] font-medium text-muted">
          {t("task.subtasks")}
        </Text>
        <Text className="font-sans text-[12px] text-muted">
          {t("task.subtasksSummary", { sent, solved })}
        </Text>
      </View>
      {view.subtasks.map((subtask) => (
        <SubtaskItem key={subtask.id} subtask={subtask} taskId={view.id} />
      ))}
    </View>
  );
};
