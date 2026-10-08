import { Hourglass, Pause, Square, Timer } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TaskViewModel } from "@pace/client";
import type { TaskStatus } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { useSubmitTitle } from "./use-submit-title.ts";

const statusOf = (view: TaskViewModel): TaskStatus | undefined =>
  view.tags.find((tag) => tag.kind === "status")?.status;

/** Starts (or stops) an activity on this task: the time lands in the Day ledger. */
const FocusButton = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const isFocused = hooks.useTimeBar().running?.taskId === view.id;
  return (
    <Pressable
      accessibilityLabel={t(isFocused ? "time.focusing" : "task.focus")}
      accessibilityRole="button"
      className={cx(
        "h-12 w-12 items-center justify-center rounded-md active:opacity-80",
        isFocused ? "bg-accent" : "bg-raised",
      )}
      onPress={() => {
        void run(isFocused ? actions.stopActivity() : actions.focusTask(view.id));
      }}
    >
      {isFocused ? (
        <Square color={palette.accentFg} size={18} strokeWidth={1.75} />
      ) : (
        <Timer color={palette.fg} size={18} strokeWidth={1.75} />
      )}
    </Pressable>
  );
};

const StatusButtons = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const status = statusOf(view);
  const set = (next: TaskStatus): void => {
    void run(actions.setStatus(view.id, next));
  };
  if (status === "paused" || status === "waiting") {
    return (
      <Button
        onPress={() => {
          set("in_progress");
        }}
        variant="secondary"
      >
        {t("task.resume")}
      </Button>
    );
  }
  return (
    <>
      <IconButton
        icon={Pause}
        label={t("task.pause")}
        onPress={() => {
          set("paused");
        }}
        variant="raised"
      />
      <IconButton
        icon={Hourglass}
        label={t("task.waiting")}
        onPress={() => {
          set("waiting");
        }}
        variant="raised"
      />
    </>
  );
};

/** Focus (stage 3), Pause / Waiting / Resume, and the primary Done or "Submit 3 and 4". */
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
      <FocusButton view={view} />
      <StatusButtons view={view} />
      {view.primaryAction.kind === "none" ? null : (
        <View className="flex-1">
          <Button onPress={onClose}>{primary}</Button>
        </View>
      )}
    </View>
  );
};
