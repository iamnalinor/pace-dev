import type { ComponentProps } from "react";

import { cn } from "#web/shared/lib/cn.ts";

/** A raised surface: the panels of the artboards (14px radius, hairline border). */
export const Card = ({ className, ...props }: ComponentProps<"section">) => (
  <section
    className={cn("rounded-xl border border-line bg-surface px-4 py-3", className)}
    data-slot="card"
    {...props}
  />
);

export const CardTitle = ({ children, className, ...props }: ComponentProps<"h2">) => (
  <h2 className={cn("text-sm font-medium text-fg2", className)} data-slot="card-title" {...props}>
    {children}
  </h2>
);
