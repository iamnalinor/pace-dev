import { ChevronDown, ChevronLeft, MoreHorizontal } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { ColorTag } from "#web/shared/ui/color-tag.tsx";

type Props = {
  readonly project: TaskViewModel["project"];
  readonly onMore: () => void;
  /** Opens the project picker: the chip is how a task changes project. */
  readonly onProject: () => void;
};

/** Back, the project the task belongs to (tap to change it), and the task's menu. */
export const TaskHeader = ({ onMore, onProject, project }: Props) => {
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
      <button
        aria-label={t("task.changeProject", { project: project?.name ?? t("task.noProject") })}
        className="flex min-h-11 items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
        onClick={onProject}
        type="button"
      >
        <ColorTag className="text-xs" color={project?.color ?? null}>
          {project?.name ?? t("task.noProject")}
        </ColorTag>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
      </button>
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
