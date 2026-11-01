import { Ban, ChevronDown, Pause, Pencil, Play, Trash2, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useIsInPane, useTaskBack } from "#app/shared/task-opener.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { BackHeader } from "#app/ui/back-header.tsx";
import { inkClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useToast } from "#app/ui/toast.tsx";

/** Deletes the task at once and goes back; the toast's Undo brings it back. */
const useDeleteTask = (view: TaskViewModel): (() => void) => {
  const t = useT();
  const { actions } = usePace();
  const back = useTaskBack();
  const toast = useToast();
  const run = useRunAction();
  return () => {
    void (async () => {
      const result = await actions.deleteTask(view.id);
      if (!(await run(Promise.resolve(result))) || !result.ok) {
        return;
      }
      back();
      const [revocation] = result.value;
      toast.show({
        message: t("task.deleted", { title: view.title }),
        ...(revocation !== undefined && {
          action: {
            label: t("common.undo"),
            onPress: () => void run(actions.revoke(revocation.id)),
          },
        }),
      });
    })();
  };
};

/**
Edit, pause or resume, give up (Cancelled or Skipped, kept in History) and delete (gone, with
Undo in the toast): the task's actions as icons, no menu in between.
*/
const TaskActions = ({
  onGiveUp,
  onEdit,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
  /** Opens the close sheet on Cancelled · Skipped, which is the confirmation. */
  readonly onGiveUp: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const isOpen = view.closed === null;
  const isPaused = view.tags.some((tag) => tag.kind === "status" && tag.status === "paused");
  const remove = useDeleteTask(view);
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
        <IconButton icon={Ban} label={t("task.giveUp")} onPress={onGiveUp} variant="plain" />
      ) : null}
      <IconButton icon={Trash2} label={t("task.delete")} onPress={remove} variant="plain" />
    </View>
  );
};

export type TaskHeaderActions = {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
  readonly onGiveUp: () => void;
};

/** The task's project, or "No project"; a tap moves the task to another one. */
const ProjectChip = ({
  onProject,
  project,
}: {
  readonly onProject: (() => void) | undefined;
  readonly project: TaskViewModel["project"];
}) => {
  const t = useT();
  const { palette } = useTheme();
  const name = project?.name ?? t("task.noProject");
  return (
    <Pressable
      accessibilityLabel={t("task.changeProject", { project: name })}
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
        {name}
      </Text>
      {onProject === undefined ? null : (
        <ChevronDown color={palette.muted} size={16} strokeWidth={2} />
      )}
    </Pressable>
  );
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
  /** Left out for a task that does not exist: there is no project to show (QA round 17 L11). */
  readonly project?: TaskViewModel["project"];
}) => {
  const t = useT();
  const back = useTaskBack();
  const isInPane = useIsInPane();
  return (
    <BackHeader
      // Beside the list the task is a pane: it closes, there is nothing to go back to.
      {...(isInPane && { backIcon: X })}
      backLabel={t(isInPane ? "common.close" : "common.back")}
      onBack={back}
      right={actions === undefined ? null : <TaskActions {...actions} />}
    >
      {project === undefined ? null : <ProjectChip onProject={onProject} project={project} />}
    </BackHeader>
  );
};
