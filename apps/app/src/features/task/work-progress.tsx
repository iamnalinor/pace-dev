import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Slider } from "#app/ui/slider.tsx";

const MAX = 10;

/** A task's progress without subtasks (0..10): a slider to drag, like a volume control. */
export const WorkProgress = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  // A closed task's progress is its outcome, shown in the tags.
  if (view.progress.mode !== "slider" || view.closed !== null) {
    return null;
  }
  const value = view.progress.slider ?? 0;
  return (
    <View className="mx-4 gap-1 rounded-xl border border-line bg-surface px-3.5 pb-1.5 pt-3.5">
      <View className="flex-row justify-between">
        <Text className="font-sans text-[14px] text-fg">{t("task.progress")}</Text>
        <Text className="font-sans text-[13px] tabular-nums text-fg">
          {t("task.progressOf", { value })}
        </Text>
      </View>
      <Slider
        label={t("task.progressAria")}
        max={MAX}
        onChange={(next) => {
          void run(actions.setProgress(view.id, next));
        }}
        value={value}
      />
    </View>
  );
};
