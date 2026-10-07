import { type Importance, IMPORTANCE_COLORS, type ProjectColorName } from "@pace/core";

import { cn } from "#web/shared/lib/cn.ts";

import { ProjectDot } from "./project-dot.tsx";

/** Literal class names, so Tailwind generates every edge colour. */
const EDGE_CLASS: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber",
  blue: "bg-project-blue",
  coral: "bg-project-coral",
  green: "bg-project-green",
  pink: "bg-project-pink",
  slate: "bg-project-slate",
  teal: "bg-project-teal",
  violet: "bg-project-violet",
};

/** The importance's colour dot; Normal has none, so it draws nothing. */
export const ImportanceDot = ({ importance }: { readonly importance: Importance }) => {
  const color = IMPORTANCE_COLORS[importance];
  return color === null ? null : <ProjectDot color={color} />;
};

/** A thin coloured edge at the start of a row; transparent for Normal so rows stay aligned. */
export const ImportanceEdge = ({
  className,
  importance,
}: {
  readonly importance: Importance;
  readonly className?: string;
}) => {
  const color = IMPORTANCE_COLORS[importance];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "w-[3px] shrink-0 self-stretch rounded-full",
        color === null ? "bg-transparent" : EDGE_CLASS[color],
        className,
      )}
    />
  );
};
