import { useState } from "react";
import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { FoldedSection, TaskRows } from "#app/shared/task-list.tsx";
import { useBack, useLeave } from "#app/shared/use-back.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Text } from "#app/ui/text.tsx";
import { toastQuote, useToast } from "#app/ui/toast.tsx";
import { archiveInEffect, type ProjectViewModel } from "@pace/client";
import { formatCount, projectById } from "@pace/core";

import { ProjectForm } from "./project-form.tsx";

/** Whether the project is archived now (the page stays open on an archived one). */
const useIsArchived = (projectId: string): boolean =>
  useAppState((state) => projectById(state.projects, projectId)?.archived ?? false);

/**
Archive and restore. Archiving says so with Undo, as the app's other soft deletes do, and goes
back to the list it leaves (QA round 27 R27-03); restoring brings it back where it is.
*/
const useArchive = (project: ProjectViewModel) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  const leave = useLeave("/projects");
  return {
    archive: async (): Promise<void> => {
      const result = await run(actions.updateProject(project.id, { archived: true }));
      if (!result.ok) {
        return;
      }
      const [archived] = result.value;
      toast.show({
        message: t("project.archived", { name: toastQuote(project.name) }),
        ...(archived !== undefined && {
          action: {
            label: t("common.undo"),
            // Writes nothing once the archive is no longer the one in effect (R28-02).
            onPress: () => void run(actions.undoArchive(project.id, archived.id)),
            undoes: [archived.id],
            holds: (state) => archiveInEffect(state.events, project.id) === archived.id,
          },
        }),
      });
      leave();
    },
    restore: async (): Promise<void> => {
      await run(actions.updateProject(project.id, { archived: false }));
    },
  };
};

/** Name, color and description, plus archive / restore. */
const EditProject = ({
  onDone,
  project,
}: {
  readonly project: ProjectViewModel;
  readonly onDone: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const isArchived = useIsArchived(project.id);
  const { archive, restore } = useArchive(project);
  return (
    <View className="mx-gutter mb-4">
      <ProjectForm
        draftKey={`project.${project.id}`}
        extra={
          <Button
            onPress={() => {
              onDone();
              void (isArchived ? restore() : archive());
            }}
            variant="plain"
          >
            {t(isArchived ? "project.restore" : "project.archive")}
          </Button>
        }
        initial={{
          color: project.color ?? "blue",
          description: project.description ?? "",
          name: project.name,
        }}
        onCancel={onDone}
        onSave={async (values) => {
          const result = await actions.updateProject(project.id, values);
          if (result.ok) {
            onDone();
          }
          return result;
        }}
        submitLabel={t("common.save")}
      />
    </View>
  );
};

/** «3 open · 1 on time · 0 late»: the figures as one quiet line, not a strip of tiles (F-CMP-16). */
const StatsLine = ({ project }: { readonly project: ProjectViewModel }) => {
  const t = useT();
  const language = useLanguage();
  const { stats } = project;
  return (
    <Text numeric role="footnote" tone="secondary">
      {t("project.statsLine", {
        late: formatCount(stats.late, language),
        onTime: `${formatCount(stats.onTime.done, language)}/${formatCount(stats.onTime.total, language)}`,
        open: formatCount(stats.open, language),
      })}
    </Text>
  );
};

/** An archived project says so, with Restore at hand rather than under Edit (R27-03). */
const ArchivedMark = ({ project }: { readonly project: ProjectViewModel }) => {
  const t = useT();
  const { restore } = useArchive(project);
  return (
    <View className="mt-1 items-start gap-1">
      <Text role="footnote" tone="secondary">
        {t("project.archivedMark")}
      </Text>
      <Button onPress={() => void restore()} size="small" variant="secondary">
        {t("project.restore")}
      </Button>
    </View>
  );
};

/** The name as the page's heading, its figures line and its description. */
const ProjectTitle = ({ project }: { readonly project: ProjectViewModel }) => {
  const isArchived = useIsArchived(project.id);
  return (
    <View className="mx-gutter mb-2 gap-1 px-row-x">
      <Text level={1} role="title1">
        {project.name}
      </Text>
      <StatsLine project={project} />
      {project.description === null ? null : (
        <Text lines={3} policy="clamp" role="callout" tone="secondary">
          {project.description}
        </Text>
      )}
      {isArchived ? <ArchivedMark project={project} /> : null}
    </View>
  );
};

/** A project: its name and figures, then its tasks as on Now: open, in future, done (each one opens). */
export const ProjectScreen = ({ id }: { readonly id: string }) => {
  const t = useT();
  const back = useBack("/projects");
  const view = usePace().hooks.useProjectView(id);
  const [isEditing, setIsEditing] = useState(false);
  const backProps = { backLabel: t("common.back"), onBack: back };
  if (!view.ok) {
    return (
      <Screen header={<ScreenHeader {...backProps} title={t("nav.projects")} variant="pushed" />}>
        <EmptyState title={t("project.notFound")} />
      </Screen>
    );
  }
  const project = view.value;
  return (
    <Screen
      header={
        <ScreenHeader
          {...backProps}
          actions={
            <Button
              onPress={() => {
                setIsEditing(!isEditing);
              }}
              size="small"
              variant="plain"
            >
              {t("project.edit")}
            </Button>
          }
          variant="pushed"
        />
      }
    >
      <ProjectTitle project={project} />
      {isEditing ? (
        <EditProject
          onDone={() => {
            setIsEditing(false);
          }}
          project={project}
        />
      ) : null}
      {project.open.length + project.future.length + project.done.length === 0 ? (
        <EmptyState title={t("project.empty")} />
      ) : null}
      {project.open.length === 0 ? null : (
        <>
          <SectionHeader count={project.open.length} title={t("now.tasks")} />
          <TaskRows label={t("now.tasks")} rows={project.open} withTag={false} />
        </>
      )}
      <FoldedSection count={project.future.length} title={t("now.future")}>
        <TaskRows label={t("now.future")} rows={project.future} withTag={false} />
      </FoldedSection>
      <FoldedSection count={project.done.length} initiallyOpen title={t("project.done")}>
        <TaskRows checked label={t("project.done")} rows={project.done} withTag={false} />
      </FoldedSection>
    </Screen>
  );
};
