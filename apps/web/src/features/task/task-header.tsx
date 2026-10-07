import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { ProjectDot } from "#web/shared/ui/project-dot.tsx";

type Props = {
  readonly project: TaskViewModel["project"];
  readonly onMore: () => void;
};

/** Back, the project the task belongs to, and the task's menu. */
export const TaskHeader = ({ onMore, project }: Props) => {
  const t = useT();
  const navigate = useNavigate();
  // A deep link has no page to go back to: it falls back to Now.
  const canGoBack = useLocation().key !== "default";
  return (
    <header className="flex items-center justify-between px-2 pt-3.5">
      <Button
        aria-label={t("common.back")}
        className="text-fg2"
        onClick={() => {
          if (canGoBack) {
            void navigate(-1);
          } else {
            void navigate("/");
          }
        }}
        size="icon"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </Button>
      {project === null ? (
        <span className="text-xs text-muted">{t("task.noProject")}</span>
      ) : (
        <Link
          className="flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-xs text-muted no-underline outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-accent/40"
          to={`/projects/${project.id}`}
        >
          <ProjectDot color={project.color} />
          {project.name}
        </Link>
      )}
      <Button
        aria-label={t("task.more")}
        className="text-fg2"
        onClick={onMore}
        size="icon"
        variant="ghost"
      >
        <MoreHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </Button>
    </header>
  );
};
