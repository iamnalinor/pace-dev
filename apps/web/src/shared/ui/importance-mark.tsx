import { cn } from "#web/shared/lib/cn.ts";
import { type Importance, IMPORTANCE_COLORS } from "@pace/core";

import { fillClass } from "./color-tag.tsx";

/** A coloured edge at the start of a row; transparent for Normal so rows stay aligned. */
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
        "w-1 shrink-0 self-stretch rounded-full",
        color === null ? "bg-transparent" : fillClass(color),
        className,
      )}
    />
  );
};
