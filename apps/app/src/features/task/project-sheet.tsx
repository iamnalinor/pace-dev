import { Pressable, View } from "react-native";

import type { TaskViewModel } from "@pace/client";
import type { ProjectColorName } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { ColorTag } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { Sheet } from "#app/ui/sheet.tsx";

type Choice = {
  readonly id: null | string;
  readonly name: string;
  readonly color: null | ProjectColorName;
};

const ChoiceRow = ({
  choice,
  isCurrent,
  onChoose,
}: {
  readonly choice: Choice;
  readonly isCurrent: boolean;
  readonly onChoose: () => void;
}) => (
  <Pressable
    accessibilityLabel={choice.name}
    accessibilityRole="radio"
    accessibilityState={{ checked: isCurrent }}
    className={cx(
      "min-h-12 flex-row items-center rounded-lg border px-3 active:opacity-70",
      isCurrent ? "border-fg" : "border-line",
    )}
    onPress={onChoose}
  >
    <ColorTag color={choice.color}>{choice.name}</ColorTag>
  </Pressable>
);

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
  const choices: readonly Choice[] = [
    { color: null, id: null, name: t("task.noProject") },
    ...Object.values(projects.byId)
      .filter((project) => !project.archived)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({ color: project.color, id: project.id, name: project.name })),
  ];
  const move = async (projectId: null | string): Promise<void> => {
    const target = projectId === null ? null : { projectId };
    if (await run(actions.setProject(view.id, target), { success: t("task.moved", { title: view.title }), undo: true })) {
      onClose();
    }
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("task.moveTitle")} visible>
      <View accessibilityRole="radiogroup" className="gap-2">
        {choices.map((choice) => (
          <ChoiceRow
            choice={choice}
            isCurrent={(view.project?.id ?? null) === choice.id}
            key={choice.id ?? "none"}
            onChoose={() => {
              void move(choice.id);
            }}
          />
        ))}
      </View>
    </Sheet>
  );
};
