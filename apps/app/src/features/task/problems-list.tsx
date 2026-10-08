import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { ProblemRow, TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

const weekday = (atIso: string, tz: string, language: string): string =>
  new Intl.DateTimeFormat(language, { timeZone: tz, weekday: "short" }).format(new Date(atIso));

const Mark = ({ state }: { readonly state: ProblemRow["state"] }) => {
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

const Problem = ({
  problem,
  taskId,
}: {
  readonly problem: ProblemRow;
  readonly taskId: string;
}) => {
  const t = useT();
  const { deviceTz, language } = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  const isSent = problem.state === "submitted";
  const note = (): string => {
    if (problem.submittedAt !== null) {
      return t("task.problemSent", { when: weekday(problem.submittedAt, deviceTz, language) });
    }
    return problem.state === "solved" ? t("task.problemSolved") : "";
  };
  return (
    <Pressable
      accessibilityLabel={problem.label}
      accessibilityRole="checkbox"
      aria-checked={problem.state !== "pending"}
      aria-disabled={isSent}
      className="min-h-[52px] flex-row items-center gap-3 border-b border-line px-1 active:opacity-70"
      disabled={isSent}
      onPress={() => {
        void run(
          problem.state === "pending"
            ? actions.markSolved(taskId, problem.id)
            : actions.unmarkSolved(taskId, problem.id),
        );
      }}
    >
      <Mark state={problem.state} />
      <Text className="w-6 font-mono text-[13px] text-muted">{problem.number ?? ""}</Text>
      <Text className={cx("flex-1 font-sans text-[15px]", isSent ? "text-muted" : "text-fg")}>
        {problem.label}
      </Text>
      <Text className="font-sans text-[12px] text-muted">{note()}</Text>
    </Pressable>
  );
};

/** The problems with their states; a tap marks one solved or takes that back (not once sent). */
export const ProblemsList = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  if (view.problems.length === 0) {
    return null;
  }
  const solved = view.problems.filter((problem) => problem.state !== "pending").length;
  const sent = view.problems.filter((problem) => problem.state === "submitted").length;
  return (
    <View className="px-4">
      <View className="flex-row items-baseline justify-between px-1 pb-1">
        <Text accessibilityRole="header" className="font-sans text-[12px] font-medium text-muted">
          {t("task.problems")}
        </Text>
        <Text className="font-sans text-[12px] text-muted">
          {t("task.problemsSummary", { sent, solved })}
        </Text>
      </View>
      {view.problems.map((problem) => (
        <Problem key={problem.id} problem={problem} taskId={view.id} />
      ))}
    </View>
  );
};
