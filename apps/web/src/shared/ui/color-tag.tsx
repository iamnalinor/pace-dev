import type { ReactNode } from "react";

import type { ProjectColorName } from "@pace/core";

import { cn } from "#web/shared/lib/cn.ts";

/*
Literal class names, so Tailwind sees every one it has to generate. A colored thing is a tag:
a light wash of the color (`TAG_TINT` in core) under text in the color's `ink-*` shade, which
the token contrast test keeps at 4.5:1 in both themes.
*/
const WASH: Readonly<Record<ProjectColorName, string>> = {
  amber: "bg-project-amber/16",
  blue: "bg-project-blue/16",
  coral: "bg-project-coral/16",
  green: "bg-project-green/16",
  pink: "bg-project-pink/16",
  slate: "bg-project-slate/16",
  teal: "bg-project-teal/16",
  violet: "bg-project-violet/16",
};

const INK: Readonly<Record<ProjectColorName, string>> = {
  amber: "text-ink-amber",
  blue: "text-ink-blue",
  coral: "text-ink-coral",
  green: "text-ink-green",
  pink: "text-ink-pink",
  slate: "text-ink-slate",
  teal: "text-ink-teal",
  violet: "text-ink-violet",
};

const EDGE: Readonly<Record<ProjectColorName, string>> = {
  amber: "border-project-amber/45",
  blue: "border-project-blue/45",
  coral: "border-project-coral/45",
  green: "border-project-green/45",
  pink: "border-project-pink/45",
  slate: "border-project-slate/45",
  teal: "border-project-teal/45",
  violet: "border-project-violet/45",
};

const SOLID: Readonly<Record<ProjectColorName, string>> = {
  amber: "border-project-amber bg-project-amber",
  blue: "border-project-blue bg-project-blue",
  coral: "border-project-coral bg-project-coral",
  green: "border-project-green bg-project-green",
  pink: "border-project-pink bg-project-pink",
  slate: "border-project-slate bg-project-slate",
  teal: "border-project-teal bg-project-teal",
  violet: "border-project-violet bg-project-violet",
};

/** Wash and ink of a colored tag; neutral without a color. */
export const tagClass = (color: null | ProjectColorName): string =>
  color === null ? "bg-raised text-fg2" : `${WASH[color]} ${INK[color]}`;

/** A colored chip: washed with a soft border, or filled with the color when it is chosen. */
export const colorChipClass = (color: ProjectColorName, isChecked: boolean): string =>
  isChecked
    ? `${SOLID[color]} font-medium text-accentFg`
    : `${WASH[color]} ${INK[color]} ${EDGE[color]}`;

/** The solid color (a color picker's swatch, a row's edge). */
export const fillClass = (color: ProjectColorName): string => SOLID[color];

/** A name in its color: a project, a category, an importance. */
export const ColorTag = ({
  children,
  className,
  color,
}: {
  readonly color: null | ProjectColorName;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}) => (
  <span
    className={cn(
      "inline-flex max-w-full items-center truncate rounded-sm px-1.5 py-px text-[11px] leading-4 font-medium",
      tagClass(color),
      className,
    )}
  >
    {children}
  </span>
);

/** A short upright bar in the color: marks a project or category in lists and headers. */
export const ColorBar = ({
  className,
  color,
}: {
  readonly color: null | ProjectColorName;
  readonly className?: string | undefined;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "h-5 w-1 shrink-0 rounded-full",
      color === null ? "bg-faint" : fillClass(color),
      className,
    )}
  />
);
