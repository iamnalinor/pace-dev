import { ChevronLeft, Pencil } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Link } from "react-router";

import type { ProjectViewModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { projectById } from "@pace/core";

import { ProjectForm } from "./project-form.tsx";
import { AwaitingTaskRow, DoneTaskRow, OpenTaskRow } from "./project-rows.tsx";
import { ProjectStats } from "./project-stats.tsx";

/** Done tasks shown before "All N done →". */
const DONE_FOLDED = 5;

const Section = ({ children, title }: { readonly children: ReactNode; readonly title: string }) => {
  const id = useId();
  return (
    <section>
      <h2 className="mx-5 mt-[18px] mb-1 text-xs font-medium text-muted" id={id}>
        {title}
      </h2>
      <ul aria-labelledby={id} className="px-4">
        {children}
      </ul>
    </section>
  );
};

const DoneSection = ({ done }: Pick<ProjectViewModel, "done">) => {
  const t = useT();
  const [isUnfolded, setIsUnfolded] = useState(false);
  if (done.length === 0) {
    return null;
  }
  const shown = isUnfolded ? done : done.slice(0, DONE_FOLDED);
  return (
    <>
      <Section title={t("project.done")}>
        {shown.map((row) => (
          <DoneTaskRow key={row.id} row={row} />
        ))}
      </Section>
      {done.length > DONE_FOLDED && (
        <Button
          className="mx-3 mt-1 self-start"
          onClick={() => {
            setIsUnfolded(!isUnfolded);
          }}
          size="sm"
          variant="link"
        >
          {isUnfolded ? t("project.lessDone") : t("project.allDone", { count: done.length })}
        </Button>
      )}
    </>
  );
};

const Header = ({
  archived,
  onEdit,
  project,
}: {
  readonly archived: boolean;
  readonly onEdit: () => void;
  readonly project: ProjectViewModel;
}) => {
  const t = useT();
  return (
    <>
      <div className="flex items-center justify-between px-2 pt-3.5">
        <Button aria-label={t("common.back")} asChild size="icon" variant="ghost">
          <Link to="/projects">
            <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
        <Button aria-label={t("project.edit")} onClick={onEdit} size="icon" variant="ghost">
          <Pencil aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </div>
      <div className="flex items-center gap-2.5 px-5">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-sm bg-faint"
          style={
            project.color === null
              ? undefined
              : { backgroundColor: `var(--color-project-${project.color})` }
          }
        />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{project.name}</h1>
        {archived && (
          <span className="rounded-sm bg-raised px-2 py-0.5 text-xs text-muted">
            {t("project.archived")}
          </span>
        )}
      </div>
      {project.description !== null && (
        <p className="px-5 pt-1 text-xs text-muted">{project.description}</p>
      )}
    </>
  );
};

/** The project page (artboard 7): header, stats, open / awaiting / done lists, editing. */
export const ProjectView = ({ projectId }: { readonly projectId: string }) => {
  const t = useT();
  const { hooks } = useServices();
  const view = hooks.useProjectView(projectId);
  const isArchived = hooks.useAppState(
    (state) => projectById(state.projects, projectId)?.archived ?? false,
  );
  const [isEditing, setIsEditing] = useState(false);
  if (!view.ok) {
    return <p className="px-5 py-8 text-sm text-muted">{t("project.notFound")}</p>;
  }
  const project = view.value;
  const isEmpty = project.open.length + project.awaiting.length + project.done.length === 0;
  return (
    <div className="flex flex-col pb-6">
      <Header
        archived={isArchived}
        onEdit={() => {
          setIsEditing(!isEditing);
        }}
        project={project}
      />
      {isEditing && (
        <ProjectForm
          archived={isArchived}
          initial={{
            color: project.color ?? "blue",
            description: project.description ?? "",
            name: project.name,
          }}
          onDone={() => {
            setIsEditing(false);
          }}
          projectId={projectId}
        />
      )}
      <ProjectStats stats={project.stats} />
      {isEmpty && <p className="px-5 py-6 text-sm text-muted">{t("project.empty")}</p>}
      {project.open.length > 0 && (
        <Section title={t("project.open")}>
          {project.open.map((row) => (
            <OpenTaskRow key={row.id} row={row} />
          ))}
        </Section>
      )}
      {project.awaiting.length > 0 && (
        <Section title={t("project.awaiting")}>
          {project.awaiting.map((row) => (
            <AwaitingTaskRow key={row.id} row={row} />
          ))}
        </Section>
      )}
      <DoneSection done={project.done} />
    </div>
  );
};
