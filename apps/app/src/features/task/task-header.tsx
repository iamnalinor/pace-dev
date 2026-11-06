import { View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useIsInPane, useTaskBack } from "#app/shared/task-opener.tsx";
import { Button } from "#app/ui/button.tsx";
import { inkClass } from "#app/ui/hue.ts";
import { Icon } from "#app/ui/icon.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Text } from "#app/ui/text.tsx";

import { TaskMenu } from "./task-menu.tsx";

export type TaskHeaderActions = {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
  /** Opens the close sheet on its Cancelled · Skipped choices. */
  readonly onGiveUp: () => void;
};

/** «Изменить» as a labelled text button and the ⋯ menu: no Pause, no bare icons (Q4, F-CMP-10). */
const TaskActions = ({ onEdit, onGiveUp, view }: TaskHeaderActions) => {
  const t = useT();
  return (
    <View className="flex-row items-center">
      <Button onPress={onEdit} size="small" variant="plain">
        {t("task.edit")}
      </Button>
      <TaskMenu onCloseAs={onGiveUp} view={view} />
    </View>
  );
};

/**
The task's project as the control that moves it: its name in the project's ink with a chevron,
one line that ends in "…" before the actions (never a pill; F-DAT-02).
*/
const ProjectControl = ({
  onProject,
  project,
}: {
  readonly onProject: (() => void) | undefined;
  readonly project: TaskViewModel["project"];
}) => {
  const t = useT();
  const name = project?.name ?? t("task.noProject");
  return (
    <Pressable
      className="min-w-0 shrink flex-row items-center gap-1"
      disabled={onProject === undefined}
      label={t("task.changeProject", { project: name })}
      onPress={onProject}
      role="button"
    >
      {project === null ? (
        <Text policy="truncate" role="body" tone="secondary">
          {name}
        </Text>
      ) : (
        <Text className={inkClass(project.color)} policy="truncate" role="body">
          {name}
        </Text>
      )}
      {onProject === undefined ? null : <Icon name="chevron-down" size="inline" />}
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
  /** Opens the project picker: the control is how a task changes project. */
  readonly onProject?: () => void;
  /** Left out for a task that does not exist: there is no project to show (QA round 17 L11). */
  readonly project?: TaskViewModel["project"];
}) => {
  const t = useT();
  const back = useTaskBack();
  const isInPane = useIsInPane();
  return (
    <ScreenHeader
      actions={actions === undefined ? undefined : <TaskActions {...actions} />}
      // Beside the list the task is a pane: it closes, there is nothing to go back to.
      backIcon={isInPane ? "x" : "chevron-left"}
      backLabel={t(isInPane ? "common.close" : "common.back")}
      context={
        project === undefined ? undefined : (
          <ProjectControl onProject={onProject} project={project} />
        )
      }
      onBack={back}
      variant="pushed"
    />
  );
};
