import { Square, Timer } from "lucide-react-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";

import { useFinishTask } from "./use-finish-task.ts";
import { useSubmitTitle } from "./use-submit-title.ts";

/** Starts (or stops) an activity on this task: the time lands in the Day ledger. */
const FocusButton = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const isFocused = hooks.useTimeBar().running?.taskId === view.id;
  return (
    <Button
      icon={isFocused ? Square : Timer}
      onPress={() => {
        void run(isFocused ? actions.stopActivity() : actions.focusTask(view.id));
      }}
      variant="secondary"
    >
      {t(isFocused ? "time.focusing" : "task.focus")}
    </Button>
  );
};

/**
Focus and the primary Done or "Submit 3 and 4", side by side and the same width. Done finishes
in one tap; a long press opens the sheet for another time or outcome (`onClose`).
*/
export const TaskFooter = ({
  onClose,
  view,
}: {
  readonly onClose: () => void;
  readonly view: TaskViewModel;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const insets = useSafeAreaInsets();
  const submitTitle = useSubmitTitle(view);
  const finish = useFinishTask(view);
  const padding = { paddingBottom: Math.max(insets.bottom, 12) + 8 };
  if (view.closed !== null) {
    return (
      <View className="flex-row items-center gap-3 border-t border-line px-4 pt-3" style={padding}>
        <Text className="flex-1 font-sans text-[13px] text-muted">
          {t("task.closedAs", { outcome: t(`outcome.${view.outcome ?? view.closed.outcome}`) })}
        </Text>
        <Button onPress={() => void run(actions.reopen(view.id))} variant="secondary">
          {t("task.reopen")}
        </Button>
      </View>
    );
  }
  const primary = view.primaryAction.kind === "submit" ? submitTitle : t("task.done");
  return (
    <View className="flex-row items-center gap-2 border-t border-line px-4 pt-3" style={padding}>
      <View className="flex-1">
        <FocusButton view={view} />
      </View>
      {view.primaryAction.kind === "none" ? null : (
        <View className="flex-1">
          <Button hint={t("task.doneHint")} onLongPress={onClose} onPress={finish}>
            {primary}
          </Button>
        </View>
      )}
    </View>
  );
};
