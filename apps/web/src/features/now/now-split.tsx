import type { ReactNode } from "react";

import { MousePointerClick } from "lucide-react";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";

import { NowScreen } from "./now-screen.tsx";

type Props = Parameters<typeof NowScreen>[0] & {
  /** The open task; without one the pane shows a hint (and only from 1024px). */
  readonly pane?: ReactNode;
};

const EmptyPane = () => {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
      <MousePointerClick aria-hidden="true" className="size-5" strokeWidth={1.75} />
      <p>{t("now.pickTask")}</p>
      <p className="text-xs text-muted">{t("shortcuts.hint")}</p>
    </div>
  );
};

/**
From 1024px Now is two panes: the list on the left, the open task on the right (its URL
stays `/task/:id`). Below that a task is a page of its own and Now is just the list.
*/
export const NowSplit = ({ pane, ...nowProps }: Props) => {
  const hasPane = pane !== undefined;
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className={cn("flex-1 flex-col", hasPane ? "hidden lg:flex" : "flex")}>
        <NowScreen {...nowProps} />
      </div>
      <div
        className={cn(
          "flex-1 flex-col lg:sticky lg:top-0 lg:flex lg:max-h-dvh lg:min-h-[60dvh] lg:overflow-y-auto lg:py-2",
          hasPane ? "flex" : "hidden",
        )}
      >
        {pane ?? <EmptyPane />}
      </div>
    </div>
  );
};
