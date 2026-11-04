import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Tooltip } from "#app/ui/tooltip.tsx";

import { useFinishTask } from "./use-finish-task.ts";
import { useSubmitTitle } from "./use-submit-title.ts";

/** Starts (or stops) an activity on this task: the time lands in the Day ledger. */
const FocusButton = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const isFocused = hooks.useTimeBar().focusedTaskId === view.id;
  return (
    <Button
      icon={isFocused ? "square" : "timer"}
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
Focus and the primary Done or "Submit 3 and 4", side by side and the same width. Done finishes
in one tap; the button beside it (and a long press on Done) opens the sheet for another time or
outcome (`onClose`), and Done's tooltip says so: a gesture nobody is told about is no way in (QA
round 19 M2).
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
  const isWide = useIsWide();
  const submitTitle = useSubmitTitle(view);
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
  const primary = view.primaryAction.kind === "submit" ? submitTitle : t("task.done");
  return (
    <View
      className="flex-row items-center gap-2 border-t border-separator px-4 pt-3"
      style={padding}
    >
      <View className="flex-1">
        <FocusButton view={view} />
      </View>
      {view.primaryAction.kind === "none" ? null : (
        <>
          <View className="flex-1">
            {/* One explanation per reader, never two: a computer shows the tooltip on hover and
            focus and describes Done by it (react-native-web drops `hint`); the phone's tooltip
            does not show on a tap here, so its screen reader gets the hint. It says what Done
            does; the long press is a shortcut to the button beside it, never taught (QA 20 L3). */}
            <Tooltip label={t("task.doneHint")}>
              <Button
                hint={t("task.doneHint")}
                onLongPress={onClose}
                onPress={finish}
                shortcut={HOTKEYS.primary}
                width="fill"
              >
                {primary}
              </Button>
            </Tooltip>
          </View>
          {/* Said in words where there is room (a bare glyph read as "more", QA round 20 L3). */}
          {isWide ? (
            <Button
              icon={"calendar-clock"}
              label={t("task.doneOther")}
              onPress={onClose}
              variant="secondary"
            >
              {t("task.doneOtherShort")}
            </Button>
          ) : (
            <IconButton icon={"calendar-clock"} label={t("task.doneOther")} onPress={onClose} />
          )}
        </>
      )}
    </View>
  );
};
