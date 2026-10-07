import type { ProjectColorName } from "@pace/core";

import { cn } from "#web/shared/lib/cn.ts";

/** Literal class names, so Tailwind sees every project colour it has to generate. */
const DOT_CLASS: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber",
  blue: "bg-project-blue",
  coral: "bg-project-coral",
  green: "bg-project-green",
  pink: "bg-project-pink",
  slate: "bg-project-slate",
  teal: "bg-project-teal",
  violet: "bg-project-violet",
};

/** The 7px colour dot that marks a project (or a preset) in rows, chips and headers. */
export const ProjectDot = ({
  className,
  color,
}: {
  readonly color: null | ProjectColorName;
  readonly className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "size-[7px] shrink-0 rounded-full",
      color === null ? "bg-faint" : DOT_CLASS[color],
      className,
    )}
  />
);
