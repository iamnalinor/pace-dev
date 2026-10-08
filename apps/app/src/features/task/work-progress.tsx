import { Minus, Plus } from "lucide-react-native";
import { type AccessibilityActionEvent, Platform, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ProgressBar } from "#app/ui/progress-bar.tsx";

const MAX = 10;

/** The work variant's progress (0..10): a bar between − and +, adjustable by screen readers. */
export const WorkProgress = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  if (view.progress.mode !== "slider") {
    return null;
  }
  const value = view.progress.slider ?? 0;
  const set = (next: number): void => {
    if (next !== value && next >= 0 && next <= MAX) {
      void run(actions.setProgress(view.id, next));
    }
  };
  const onAction = (event: AccessibilityActionEvent): void => {
    set(event.nativeEvent.actionName === "increment" ? value + 1 : value - 1);
  };
  return (
    <View className="mx-4 gap-3 rounded-xl border border-line bg-surface p-3.5">
      <View className="flex-row justify-between">
        <Text className="font-sans text-[14px] text-fg">{t("task.progress")}</Text>
        <Text className="font-mono text-[13px] text-fg">{t("task.progressOf", { value })}</Text>
      </View>
      <View
        className="flex-row items-center gap-3"
        // TalkBack reads the row as one slider; a browser keeps the two buttons and the bar.
        {...(Platform.OS !== "web" && {
          accessibilityActions: [{ name: "increment" }, { name: "decrement" }],
          accessibilityLabel: t("task.progressAria"),
          accessibilityRole: "adjustable",
          accessible: true,
          "aria-valuemax": MAX,
          "aria-valuemin": 0,
          "aria-valuenow": value,
          onAccessibilityAction: onAction,
        })}
      >
        <IconButton
          icon={Minus}
          label={t("task.progressLess")}
          onPress={() => {
            set(value - 1);
          }}
          variant="raised"
        />
        <View className="flex-1">
          <ProgressBar label={t("task.progressAria")} marker={null} value={value / MAX} />
        </View>
        <IconButton
          icon={Plus}
          label={t("task.progressMore")}
          onPress={() => {
            set(value + 1);
          }}
          variant="raised"
        />
      </View>
    </View>
  );
};
