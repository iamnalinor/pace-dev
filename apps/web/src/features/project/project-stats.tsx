import type { ReactNode } from "react";

import type { ProjectStats as Stats } from "@pace/core";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";

const MINUTES_PER_HOUR = 60;
const PERCENT = 100;

/** `6.33` hours → `6:20`, the artboard's tracked-time notation. */
const clockHours = (hours: number): string => {
  const minutes = Math.round(hours * MINUTES_PER_HOUR);
  return `${Math.floor(minutes / MINUTES_PER_HOUR)}:${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}`;
};

const Figure = ({ children, label }: { readonly children: ReactNode; readonly label: string }) => (
  <div aria-label={label} role="group">
    <p aria-hidden="true" className="text-[11px] text-muted">
      {label}
    </p>
    <p className="mt-0.5 font-mono text-lg">{children}</p>
  </div>
);

/** The stats card: open · on time x/y · late · hours this week, and the last six weeks as bars. */
export const ProjectStats = ({ stats }: { readonly stats: Stats }) => {
  const t = useT();
  const highest = Math.max(...stats.weeklyHours, 1);
  return (
    <section
      aria-label={t("project.stats")}
      className="mx-4 mt-4 rounded-xl border border-line bg-surface p-3.5"
    >
      <div className="grid grid-cols-4 gap-2">
        <Figure label={t("project.stat.open")}>{stats.open}</Figure>
        <Figure label={t("project.stat.onTime")}>
          {stats.onTime.done}
          <span className="text-xs text-muted">/{stats.onTime.total}</span>
        </Figure>
        <Figure label={t("project.stat.late")}>
          <span className={cn(stats.late > 0 && "text-warn")}>{stats.late}</span>
        </Figure>
        <Figure label={t("project.stat.thisWeek")}>{clockHours(stats.hoursThisWeek)}</Figure>
      </div>
      <div
        aria-label={t("project.hoursChart", { values: stats.weeklyHours.join(", ") })}
        className="mt-3.5 flex h-14 items-end gap-1.5"
        role="img"
      >
        {stats.weeklyHours.map((hours, index) => (
          <span
            className={cn(
              "min-h-0.5 flex-1 rounded-[3px]",
              index === stats.weeklyHours.length - 1 ? "bg-accent" : "bg-track",
            )}
            // The bars are weeks in order: the position is the week.
            // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
            key={index}
            style={{ height: `${(hours / highest) * PERCENT}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{t("project.weeksAgo")}</span>
        <span>{t("project.hoursPerWeek")}</span>
        <span>{t("project.now")}</span>
      </div>
    </section>
  );
};
