import type { ProjectChip } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { ProjectDot } from "#web/shared/ui/project-dot.tsx";

type Props = {
  readonly projects: readonly ProjectChip[];
  /** The filtered project, `null` for all. */
  readonly selected: null | string;
  readonly onSelect: (projectId: null | string) => void;
};

const chipClass = (isSelected: boolean): string =>
  cn(
    // 32px pills as drawn; the pseudo-element grows the touch target to 44px.
    "relative flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-xs transition-colors outline-none after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-[3px] focus-visible:ring-accent/40",
    isSelected
      ? "bg-inverse font-medium text-inverseFg"
      : "border border-line text-fg2 hover:bg-raised",
  );

/** All + every project with open tasks; the choice lives in the URL (`?project=`). */
export const ProjectChips = ({ onSelect, projects, selected }: Props) => {
  const t = useT();
  if (projects.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label={t("now.filterByProject")}
      className="flex gap-1.5 overflow-x-auto px-4 pt-1.5 pb-2"
    >
      <button
        aria-pressed={selected === null}
        className={chipClass(selected === null)}
        onClick={() => {
          onSelect(null);
        }}
        type="button"
      >
        {t("now.allProjects")}
      </button>
      {projects.map((project) => (
        <button
          aria-pressed={selected === project.id}
          className={chipClass(selected === project.id)}
          key={project.id}
          onClick={() => {
            onSelect(project.id);
          }}
          type="button"
        >
          <ProjectDot color={project.color} />
          {project.name}
        </button>
      ))}
    </nav>
  );
};
