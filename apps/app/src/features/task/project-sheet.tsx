import { View } from "react-native";

import type { TaskViewModel } from "@pace/client";
import type { ProjectColorName } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { Dot } from "#app/ui/tag.tsx";

/** A project as a value (spec §4.2.7): its dot before the name; "No project" has an empty ring. */
const ProjectDot = ({ color }: { readonly color: null | ProjectColorName }) =>
  color === null ? (
    <View className="size-2 rounded-pill border border-outline" />
  ) : (
    <Dot hue={color} />
  );

/** "No project" among the project ids (a radio needs a value; no id is empty). */
const NO_PROJECT = "";

/** Moves the task to another project, or out of any. */
export const ProjectSheet = ({
  onClose,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const run = useRunAction();
  const projects = hooks.useAppState((state) => state.projects);
  /** A project to move to, or none. */
  type Choice = {
    readonly id: null | string;
    readonly name: string;
    readonly color: null | ProjectColorName;
  };
  const choices: readonly Choice[] = [
    { color: null, id: null, name: t("task.noProject") },
    ...Object.values(projects.byId)
      .filter((project) => !project.archived)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({ color: project.color, id: project.id, name: project.name })),
  ];
  const move = async (projectId: null | string): Promise<void> => {
    const target = projectId === null ? null : { projectId };
    const moving = await run(actions.setProject(view.id, target));
    if (moving.ok) {
      onClose();
    }
  };
  return (
    <Sheet
      closeLabel={t("common.close")}
      name="move-to-project"
      onClose={onClose}
      open
      title={t("task.moveTitle")}
    >
      <RadioGroup
        label={t("task.moveTitle")}
        onChange={(id: string) => {
          void move(id === NO_PROJECT ? null : id);
        }}
        value={view.project?.id ?? NO_PROJECT}
        values={choices.map((choice) => choice.id ?? NO_PROJECT)}
      >
        {choices.map((choice) => (
          <ListRow
            key={choice.id ?? NO_PROJECT}
            leading={<ProjectDot color={choice.color} />}
            select={choice.id ?? NO_PROJECT}
            title={choice.name}
            titleLines={2}
          />
        ))}
      </RadioGroup>
    </Sheet>
  );
};
