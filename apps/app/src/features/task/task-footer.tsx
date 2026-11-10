import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useIsInPane } from "#app/shared/task-opener.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button, KeyHintRoomContext } from "#app/ui/button.tsx";
import { HOTKEYS, labelWithHotkey } from "#app/ui/hotkeys.ts";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";

import { useFinishTask } from "./use-finish-task.ts";

/** Starts (or stops) an activity on this task: the time lands in the Day ledger. */
const FocusButton = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const isFocused = hooks.useTimeBar().focusedTaskId === view.id;
  return (
    <Button
      icon={isFocused ? "square" : "timer"}
      isIconFilled={isFocused}
      onPress={() => {
        void run(isFocused ? actions.stopActivity() : actions.focusTask(view.id));
      }}
      shortcut={HOTKEYS.focus}
      variant="secondary"
      // The left half of the footer's split row: it fills its half on every window.
      width="fill"
    >
      {t(isFocused ? "time.focusing" : "task.focus")}
    </Button>
  );
};

/**
Focus and the primary Done, side by side and the same width (spec §5.11), and under them «Other
time or outcome…» in words: Done finishes in one tap; the button under it (and a long press on Done,
and ⋯ › Close as…) opens the sheet for another time or outcome (`onClose`); a gesture nobody is told
about is no way in (QA round 19 M2). A third button on the row crushed the two halves into a letter
a line in the 400 px pane (design review B1), so the row holds two, and the pane shows no shortcut
hints on them (Done's tooltip names Ctrl+Enter).
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
  const isInPane = useIsInPane();
  // The pane has no room for the key on the button: its tooltip and hint name it (R27-08).
  const doneHint = labelWithHotkey(t("task.doneHint"), HOTKEYS.primary, KEYBOARD);
  const finish = useFinishTask(view);
  const padding = { paddingBottom: Math.max(insets.bottom, 12) + 8 };
  if (view.closed !== null) {
    return (
      <View
        className="flex-row items-center gap-3 border-t border-separator px-4 pt-3"
        style={padding}
      >
        <Text className="flex-1 font-sans text-footnote text-label-secondary">
          {t("task.closedAs", { outcome: t(`outcome.${view.outcome ?? view.closed.outcome}`) })}
        </Text>
        <Button onPress={() => void run(actions.reopen(view.id))} variant="secondary">
          {t("task.reopen")}
        </Button>
      </View>
    );
  }
  return (
    <View className="gap-1 border-t border-separator px-4 pt-3" style={padding}>
      <KeyHintRoomContext value={!isInPane}>
        <View className="flex-row items-center gap-2" testID="task-footer-main">
          <View className="flex-1">
            <FocusButton view={view} />
          </View>
          {view.primaryAction.kind === "none" ? null : (
            <View className="flex-1">
              {/* One explanation per reader, never two: a computer shows the tooltip on hover and
              focus and describes Done by it (react-native-web drops `hint`); the phone's tooltip
              does not show on a tap here, so its screen reader gets the hint. It says what Done
              does; the long press is a shortcut to the button under it, never taught (QA 20 L3). */}
              <Tooltip label={doneHint}>
                <Button
                  hint={doneHint}
                  onLongPress={onClose}
                  onPress={finish}
                  shortcut={HOTKEYS.primary}
                  width="fill"
                >
                  {t("task.done")}
                </Button>
              </Tooltip>
            </View>
          )}
        </View>
      </KeyHintRoomContext>
      {view.primaryAction.kind === "none" ? null : (
        <View className="items-center">
          <Button icon="calendar-clock" onPress={onClose} size="small" variant="plain" width="hug">
            {t("task.doneOther")}
          </Button>
        </View>
      )}
    </View>
  );
};
