import { ChevronDown, Pause, Pencil, Play, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useTaskBack } from "#app/shared/task-opener.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { BackHeader } from "#app/ui/back-header.tsx";
import { inkClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** Edit, pause or resume, delete: the task's actions as icons, no menu in between. */
const TaskActions = ({
  onDelete,
  onEdit,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
  /** Opens the close sheet on Cancelled · Skipped, which is the confirmation. */
  readonly onDelete: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const isOpen = view.closed === null;
  const isPaused = view.tags.some((tag) => tag.kind === "status" && tag.status === "paused");
  return (
    <View className="flex-row">
      <IconButton icon={Pencil} label={t("task.edit")} onPress={onEdit} variant="plain" />
      {isOpen ? (
        <IconButton
          icon={isPaused ? Play : Pause}
          label={t(isPaused ? "task.resume" : "task.pause")}
          onPress={() => {
            void run(actions.setStatus(view.id, isPaused ? "in_progress" : "paused"));
          }}
          variant="plain"
        />
      ) : null}
      {isOpen ? (
        <IconButton icon={Trash2} label={t("task.delete")} onPress={onDelete} variant="plain" />
      ) : null}
    </View>
  );
};

export type TaskHeaderActions = {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
};

/** Back, the project (tap to move the task), and the task's actions. */
export const TaskHeader = ({
  actions,
  onProject,
  project,
}: {
  readonly actions?: TaskHeaderActions;
  /** Opens the project picker: the chip is how a task changes project. */
  readonly onProject?: () => void;
  readonly project: TaskViewModel["project"];
}) => {
  const t = useT();
  const back = useTaskBack();
  const { palette } = useTheme();
  return (
    <BackHeader
      backLabel={t("common.back")}
      onBack={back}
      right={actions === undefined ? null : <TaskActions {...actions} />}
    >
      <Pressable
        accessibilityLabel={t("task.changeProject", {
          project: project?.name ?? t("task.noProject"),
        })}
        accessibilityRole="button"
        className="h-11 flex-row items-center gap-1 active:opacity-70"
        disabled={onProject === undefined}
        onPress={onProject}
      >
        <Text
          className={cx(
            "font-sans text-[15px] font-medium",
            project === null ? "text-fg2" : inkClass(project.color),
          )}
          numberOfLines={1}
        >
          {project?.name ?? t("task.noProject")}
        </Text>
        {onProject === undefined ? null : (
          <ChevronDown color={palette.muted} size={16} strokeWidth={2} />
        )}
      </Pressable>
    </BackHeader>
  );
};
