import type { ComponentProps, ReactNode } from "react";

import { Link, useMatch } from "react-router";

import type { NowRow } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMeta, type MetaTone } from "#web/shared/format/meta.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { ImportanceEdge } from "#web/shared/ui/importance-mark.tsx";
import { PaceBar } from "#web/shared/ui/pace-bar.tsx";
import { ProjectDot } from "#web/shared/ui/project-dot.tsx";

const TONE_CLASS: Readonly<Record<MetaTone, string>> = {
  plain: "",
  strong: "font-medium text-fg",
  warn: "text-warn",
};

/** `Due tomorrow 23:59 · 4/7 solved · 2 sent`, with ASAP stressed and lateness in warn. */
const MetaLine = ({ now, row }: { readonly row: NowRow; readonly now: string | undefined }) => {
  const language = useLanguage();
  const ctx = useServices().hooks.useClock();
  const segments = formatMeta(row.meta, { deviceTz: ctx.deviceTz, language, now: now ?? ctx.now });
  if (segments.length === 0) {
    return null;
  }
  return (
    <p className="text-xs text-muted">
      {segments.map((segment, index) => (
        // The parts are positional and never reorder within a row.
        // eslint-disable-next-line react/no-array-index-key -- positional, never reordered
        <span key={index}>
          {index > 0 && " · "}
          <span className={TONE_CLASS[segment.tone]}>{segment.text}</span>
        </span>
      ))}
    </p>
  );
};

type Props = Omit<ComponentProps<"li">, "children"> & {
  readonly row: NowRow;
  /** The check circle's action; without it the row is read-only (a past board). */
  readonly onCheck?: ((row: NowRow) => void) | undefined;
  /** The first row of the board sits on a faint surface. */
  readonly isTop?: boolean;
  /** Reads relative days ("tomorrow") against this instant instead of the clock. */
  readonly now?: string | undefined;
  /** A trailing control (the reorder handle). */
  readonly trailing?: ReactNode;
};

/**
One task as the Now board draws it (artboard 1): check circle, colour dot, title, meta
line and the progress bar with its pace marker. The project page reuses it for open tasks.
*/
export const TaskRow = ({
  className,
  isTop = false,
  now,
  onCheck,
  row,
  trailing,
  ...props
}: Props) => {
  const t = useT();
  const hasBar = row.progress > 0 || row.paceExpected !== null;
  // The task open in the pane beside the list (from 1024px) is marked in the list.
  const isOpen = useMatch("/task/:id")?.params.id === row.id;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg py-3 pr-3 pl-1.5",
        isTop && "bg-fg/[0.035]",
        isOpen && "bg-raised",
        className,
      )}
      {...props}
    >
      <ImportanceEdge className="-mr-1.5" importance={row.importance} />
      {onCheck !== undefined && (
        <button
          aria-label={t("now.markDone", { title: row.title })}
          className="relative mt-px size-[22px] shrink-0 rounded-full border-[1.5px] border-muted transition-colors outline-none after:absolute after:inset-[-11px] hover:border-fg focus-visible:ring-[3px] focus-visible:ring-accent/40"
          onClick={() => {
            onCheck(row);
          }}
          type="button"
        />
      )}
      <Link
        aria-current={isOpen ? "page" : undefined}
        className="flex min-w-0 flex-1 flex-col gap-[5px] rounded-sm text-inherit no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
        to={`/task/${row.id}`}
      >
        <span className="flex items-center gap-2">
          <ProjectDot color={row.color} />
          <span className={cn("truncate text-[15px]", row.dimmed ? "text-fg2" : "font-medium")}>
            {row.title}
          </span>
        </span>
        <MetaLine now={now} row={row} />
        {hasBar && <PaceBar pace={row.paceExpected} value={row.progress} />}
      </Link>
      {trailing}
    </li>
  );
};
