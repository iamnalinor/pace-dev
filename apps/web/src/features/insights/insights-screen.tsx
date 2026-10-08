import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { InsightBar, OnTimeView } from "@pace/client";
import type { EstimateRow } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatEyebrow } from "#web/shared/lib/eyebrow.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { fillClass } from "#web/shared/ui/color-tag.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

import { FocusSleepCard, FragmentationCard, HoursChart } from "./patterns.tsx";

/**
One measure per chart, one row per entity: the name and the value are text (color is never
the only label), the bar is the entity's own color, anchored at zero with rounded ends.
*/
const Bars = ({
  bars,
  label,
  nameOf,
}: {
  readonly bars: readonly InsightBar[];
  readonly label: string;
  readonly nameOf: (bar: InsightBar) => string;
}) => {
  const language = useLanguage();
  return (
    <section aria-label={label} className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-fg">{label}</h2>
      <ul className="grid gap-2.5">
        {bars.map((bar) => {
          const name = nameOf(bar);
          const value = formatMinutes(bar.minutes, language);
          return (
            <li
              className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3 text-xs"
              key={bar.key ?? "none"}
            >
              <span className="truncate text-fg2">{name}</span>
              <span
                className="h-2.5 overflow-hidden rounded-r bg-track"
                title={`${name}: ${value}`}
              >
                <span
                  className={`block h-full rounded-r ${bar.color === null ? "bg-faint" : fillClass(bar.color)}`}
                  style={{ width: `${String(Math.max(2, Math.round(bar.share * 100)))}%` }}
                />
              </span>
              <span className="font-mono text-fg">{value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Per project: how many of the tasks closed this week met their deadline. */
const OnTimeCard = ({ rows }: { readonly rows: readonly OnTimeView[] }) => {
  const t = useT();
  return rows.length === 0 ? null : (
    <section
      aria-label={t("insights.onTime")}
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="mb-3 text-sm font-medium text-fg">{t("insights.onTime")}</h2>
      <ul className="grid gap-2 text-xs">
        {rows.map((row) => (
          <li className="flex justify-between gap-3" key={row.projectId ?? "none"}>
            <span className="truncate text-fg2">{row.name ?? t("insights.noProject")}</span>
            <span className="font-mono text-fg">
              {t("insights.onTimeRow", { onTime: row.onTime, total: row.total })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Plan against fact for the tasks closed this week. */
const EstimatesCard = ({ rows }: { readonly rows: readonly EstimateRow[] }) => {
  const t = useT();
  const language = useLanguage();
  return rows.length === 0 ? null : (
    <section
      aria-label={t("insights.estimates")}
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="mb-3 text-sm font-medium text-fg">{t("insights.estimates")}</h2>
      <ul className="grid gap-2 text-xs">
        {rows.map((row) => (
          <li className="flex justify-between gap-3" key={row.taskId}>
            <span className="truncate text-fg2">{row.title}</span>
            <span className="shrink-0 font-mono text-fg">
              {t("insights.estimateRow", {
                estimate: formatMinutes(row.estimateMinutes, language),
                tracked: formatMinutes(row.trackedMinutes, language),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** One week of the ledger: where the time went, what got done on time, plan against fact. */
export const InsightsScreen = () => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const { deviceTz } = hooks.useClock();
  const [weekOf, setWeekOf] = useState<null | string>(null);
  const week = hooks.useInsights(weekOf);
  const hasTime = week.totalMinutes > 0;
  return (
    <main className="flex flex-1 flex-col gap-4 pb-6">
      <PageHeader
        action={
          <div className="flex items-center gap-1">
            <Button
              aria-label={t("insights.previous")}
              onClick={() => {
                setWeekOf(week.previous);
              }}
              size="icon"
              variant="ghost"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              aria-label={t("insights.next")}
              disabled={week.next === null}
              onClick={() => {
                setWeekOf(week.next);
              }}
              size="icon"
              variant="ghost"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        }
        eyebrow={t("insights.week", {
          date: formatEyebrow(new Date(week.weekStart), language, deviceTz),
        })}
        title={t("insights.title")}
      />
      <div className="grid gap-3 px-5 lg:grid-cols-2">
        {hasTime ? (
          <>
            <p className="text-sm text-fg lg:col-span-2">
              {t("insights.total", { duration: formatMinutes(week.totalMinutes, language) })}
            </p>
            <Bars
              bars={week.byCategory}
              label={t("insights.byCategory")}
              nameOf={(bar) => t(`category.${bar.key ?? "other"}` as `category.other`)}
            />
            <Bars
              bars={week.byProject}
              label={t("insights.byProject")}
              nameOf={(bar) => bar.name ?? t("insights.noProject")}
            />
            <HoursChart hours={week.hours} />
            <FragmentationCard fragmentation={week.fragmentation} />
            <FocusSleepCard days={week.focusSleep} zone={deviceTz} />
          </>
        ) : (
          <p className="text-sm text-muted lg:col-span-2">{t("insights.nothing")}</p>
        )}
        <OnTimeCard rows={week.onTime} />
        <EstimatesCard rows={week.estimates} />
      </div>
    </main>
  );
};
