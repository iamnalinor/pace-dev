import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import type { ProjectViewModel } from "@pace/client";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { ProjectForm } from "#app/features/projects/project-form.tsx";
import { FoldedSection, TaskRows } from "#app/shared/task-list.tsx";
import { Button } from "#app/ui/button.tsx";
import { washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { projectById } from "@pace/core";

import { PushedScreen } from "./pushed-screen.tsx";

const Figure = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <View
    accessibilityLabel={`${label}: ${value}`}
    accessible
    className="flex-1 gap-0.5"
    role="group"
  >
    <Text className="font-sans text-[11px] text-muted">{label}</Text>
    <Text className="font-sans text-[18px] tabular-nums text-fg">{value}</Text>
  </View>
);

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
  const isArchived = useAppState(
    (state) => projectById(state.projects, project.id)?.archived ?? false,
  );
  return (
    <View className="mx-4 mb-4">
      <ProjectForm
        extra={
          <Button
            onPress={() => {
              void actions.updateProject(project.id, { archived: !isArchived });
              onDone();
            }}
            variant="ghost"
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

/** Open, on time and late, on the project's own wash. */
const Stats = ({ project }: { readonly project: ProjectViewModel }) => {
  const t = useT();
  const { stats } = project;
  return (
    <View
      className={cx(
        "mx-4 mb-4 flex-row gap-2 rounded-xl border p-3.5",
        project.color === null ? "border-line bg-surface" : washClass(project.color),
      )}
    >
      <Figure label={t("project.stat.open")} value={String(stats.open)} />
      <Figure
        label={t("project.stat.onTime")}
        value={`${String(stats.onTime.done)}/${String(stats.onTime.total)}`}
      />
      <Figure label={t("project.stat.late")} value={String(stats.late)} />
    </View>
  );
};

/** A project: its figures, then its tasks as on Now: open, in future, done (each one opens). */
export const ProjectScreen = ({ id }: { readonly id: string }) => {
  const t = useT();
  const view = usePace().hooks.useProjectView(id);
  const [isEditing, setIsEditing] = useState(false);
  if (!view.ok) {
    return (
      <PushedScreen title={t("nav.projects")}>
        <EmptyState>{t("project.notFound")}</EmptyState>
      </PushedScreen>
    );
  }
  const project = view.value;
  return (
    <PushedScreen
      right={
        <IconButton
          icon={Pencil}
          label={t("project.edit")}
          onPress={() => {
            setIsEditing(!isEditing);
          }}
          variant="plain"
        />
      }
      title={project.name}
    >
      {isEditing ? (
        <EditProject
          onDone={() => {
            setIsEditing(false);
          }}
          project={project}
        />
      ) : null}
      {project.description === null ? null : (
        <Text className="mx-5 mb-3 font-sans text-[14px] text-fg2">{project.description}</Text>
      )}
      <Stats project={project} />
      {project.open.length + project.future.length + project.done.length === 0 ? (
        <EmptyState>{t("project.empty")}</EmptyState>
      ) : null}
      <TaskRows label={t("now.tasks")} rows={project.open} withTag={false} />
      <FoldedSection count={project.future.length} title={t("now.future")}>
        <TaskRows label={t("now.future")} rows={project.future} withTag={false} />
      </FoldedSection>
      <FoldedSection count={project.done.length} initiallyOpen title={t("project.done")}>
        <TaskRows checked label={t("project.done")} rows={project.done} withTag={false} />
      </FoldedSection>
    </PushedScreen>
  );
};
