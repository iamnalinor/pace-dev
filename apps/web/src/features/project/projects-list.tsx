import { Link } from "react-router";

import { useLanguage } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { cardClass } from "#web/shared/ui/color-tag.tsx";
import { plural } from "@pace/core";

import { NewProjectForm } from "./new-project-form.tsx";
import { type ProjectSummary, useProjectSummaries } from "./use-project-summaries.ts";

const SummaryRow = ({ project }: { readonly project: ProjectSummary }) => {
  const t = useT();
  const language = useLanguage();
  const open = plural(language, project.open, {
    few: t("projects.open.few"),
    many: t("projects.open.many"),
    one: t("projects.open.one"),
    other: t("projects.open.other"),
  });
  return (
    <li>
      <Link
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-xl border px-4 outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
          project.archived ? "border-line bg-surface text-muted" : cardClass(project.color),
        )}
        to={`/projects/${project.id}`}
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{project.name}</span>
        <span className="font-mono text-xs text-fg2">
          {project.archived ? t("project.archived") : open}
          {project.onTime.total > 0 &&
            ` · ${t("projects.onTime", { done: project.onTime.done, total: project.onTime.total })}`}
        </span>
      </Link>
    </li>
  );
};

/** The Projects tab: each project with its open count and on-time ratio, and an inline "new". */
export const ProjectsList = () => {
  const t = useT();
  const projects = useProjectSummaries();
  return (
    <div className="grid gap-4 px-4">
      {projects.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted">{t("projects.empty")}</p>
      ) : (
        <ul aria-label={t("nav.projects")} className="grid gap-2">
          {projects.map((project) => (
            <SummaryRow key={project.id} project={project} />
          ))}
        </ul>
      )}
      <NewProjectForm />
    </div>
  );
};
