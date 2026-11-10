import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import type { Project } from "@pace/core";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { HueTile } from "#app/ui/tag.tsx";
import { Text } from "#app/ui/text.tsx";
import { openTasksLabel } from "@pace/client";

import { ProjectForm } from "./project-form.tsx";

/**
The inline form of a new project: a name and a color, created on the spot. It sits at the top of
the list; closing it (cancelled or created) goes back to the header's button through `onClose`.
*/
const NewProject = ({ onClose }: { readonly onClose: () => void }) => {
  const t = useT();
  const { actions } = usePace();
  return (
    <View className="mx-gutter mb-3 mt-3">
      <ProjectForm
        draftKey="project.new"
        initial={{ color: "blue", name: "" }}
        isNameFocused
        onCancel={onClose}
        onSave={async (values) => {
          const result = await actions.createProject(values);
          if (result.ok) {
            onClose();
          }
          return result;
        }}
        submitLabel={t("projects.create")}
      />
    </View>
  );
};

/** A project's row: its tile, its name, and its open count (or that it is archived). */
const ProjectRow = ({
  note,
  project,
}: {
  readonly project: Pick<Project, "color" | "id" | "name">;
  readonly note: string;
}) => {
  const router = useRouter();
  return (
    <ListRow
      // The name in full (the title clamps at two lines) and the note beside it: the label
      // stands in for everything the row shows, so it says both (audit 4.8).
      label={`${project.name}, ${note}`}
      leading={<HueTile hue={project.color ?? "slate"} icon="folder" />}
      onPress={() => {
        router.push(`/project/${project.id}`);
      }}
      role="link"
      title={project.name}
      titleLines={2}
      trailing={
        <View className="flex-row items-center gap-2">
          <Text numeric role="footnote" tone="secondary">
            {note}
          </Text>
          <Icon name="chevron-right" size="inline" tone="tertiary" />
        </View>
      }
    />
  );
};

/** The archived projects, by name. */
const useArchivedProjects = (): readonly Project[] => {
  const projects = useAppState((state) => state.projects);
  return Object.values(projects.byId)
    .filter((project) => project.archived)
    .toSorted((a, b) => a.name.localeCompare(b.name));
};

/** Every active project with its open count; a tap opens its page. */
export const ProjectsScreen = () => {
  const t = useT();
  const back = useBack();
  const { hooks } = usePace();
  const language = useLanguage();
  const active = hooks.useProjects();
  const [isOpen, setIsOpen] = useState(false);
  // Archived projects come after the active ones, once asked for, as deleted presets do (R27-03).
  const [isShowingArchived, setIsShowingArchived] = useState(false);
  const archived = useArchivedProjects();
  const focus = useConfirmFocus();
  const close = (): void => {
    // The form goes and focus goes back to the button, not to the top of the page (QA round 18 L9).
    focus.toOpener();
    setIsOpen(false);
  };
  return (
    <Screen
      header={
        <ScreenHeader
          actions={
            <Button
              icon="plus"
              onPress={() => {
                setIsOpen(true);
              }}
              ref={focus.openerRef()}
              size="small"
              variant="secondary"
            >
              {t("projects.new")}
            </Button>
          }
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          title={t("nav.projects")}
          variant="top"
        />
      }
    >
      {isOpen ? <NewProject onClose={close} /> : null}
      {active.length === 0 ? <EmptyState title={t("projects.empty")} /> : null}
      <Group>
        {active.map((project) => (
          <ProjectRow
            key={project.id}
            note={openTasksLabel(language, project.open)}
            project={project}
          />
        ))}
        {isShowingArchived
          ? archived.map((project) => (
              <ProjectRow key={project.id} note={t("project.archivedBadge")} project={project} />
            ))
          : null}
      </Group>
      <View className="mt-4">
        <Group>
          <SwitchRow
            isOn={isShowingArchived}
            label={t("projects.showArchived")}
            onChange={setIsShowingArchived}
          />
        </Group>
      </View>
    </Screen>
  );
};
