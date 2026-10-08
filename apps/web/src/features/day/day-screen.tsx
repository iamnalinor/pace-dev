import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import type { DayEntry, DayRow } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatTime } from "#web/shared/format/time.ts";
import { formatEyebrow } from "#web/shared/lib/eyebrow.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ColorTag } from "#web/shared/ui/color-tag.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";

const ActivityRow = ({
  onEdit,
  row,
  zone,
}: {
  readonly row: DayRow;
  readonly zone: string;
  readonly onEdit: () => void;
}) => {
  const t = useT();
  const language = useLanguage();
  return (
    <li className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="w-[5.5rem] shrink-0 pt-0.5 font-mono text-xs text-muted">
        {formatTime(row.startAt, zone, language)}–{row.isRunning ? "" : formatTime(row.endAt, zone, language)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          <span className="truncate font-medium">{row.label}</span>
          {row.isRunning && <span className="text-xs text-accentText">{t("day.running")}</span>}
        </span>
        {row.taskId !== null && row.taskTitle !== null && (
          <Link className="truncate text-xs text-fg2 underline-offset-2 hover:underline" to={`/task/${row.taskId}`}>
            {row.taskTitle}
          </Link>
        )}
      </div>
      <span className="pt-0.5 font-mono text-xs text-fg2">{formatMinutes(row.minutes, language)}</span>
      <Button aria-label={t("day.edit", { label: row.label })} onClick={onEdit} size="sm" variant="ghost">
        {t("common.edit")}
      </Button>
    </li>
  );
};

const GapRow = ({ entry, onLog }: { readonly entry: Extract<DayEntry, { kind: "gap" }>; readonly onLog: () => void }) => {
  const t = useT();
  const language = useLanguage();
  return (
    <li className="my-1 flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
      {t("day.gap", { duration: formatMinutes(entry.gap.minutes, language) })}
      <Button onClick={onLog} size="sm" variant="outline">
        {t("day.logGap")}
      </Button>
    </li>
  );
};

/** One day of the time ledger: totals per category, the timeline with its gaps, edits. */
export const DayScreen = () => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const [date, setDate] = useState<null | string>(null);
  const [sheet, setSheet] = useState<null | SheetTarget>(null);
  const day = hooks.useDay(date);
  const { now } = hooks.useClock();
  const end = (iso: string): string => (iso > now ? now : iso);
  return (
    <main className="flex flex-1 flex-col gap-3 pb-6">
      <PageHeader
        action={
          <div className="flex items-center gap-1">
            <Button aria-label={t("day.previous")} onClick={() => setDate(day.previous)} size="icon" variant="ghost">
              <ChevronLeft aria-hidden="true" />
            </Button>
            {!day.isToday && (
              <Button onClick={() => setDate(null)} size="sm" variant="outline">
                {t("day.today")}
              </Button>
            )}
            <Button
              aria-label={t("day.next")}
              disabled={day.next === null}
              onClick={() => setDate(day.next)}
              size="icon"
              variant="ghost"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        }
        eyebrow={formatEyebrow(new Date(day.date), language, day.zone)}
        title={t("day.title")}
      />
      <section className="flex flex-wrap items-center gap-1.5 px-5">
        <span className="mr-1 text-sm text-fg">
          {t("day.tracked", { duration: formatMinutes(day.trackedMinutes, language) })}
        </span>
        {day.totals.map((total) => (
          <ColorTag color={total.color} key={total.category}>
            {t(`category.${total.category}`)} · {formatMinutes(total.minutes, language)}
          </ColorTag>
        ))}
      </section>
      <section aria-label={t("day.title")} className="px-5">
        {day.entries.length === 0 ? (
          <p className="py-6 text-sm text-muted">{t("day.empty")}</p>
        ) : (
          <ul>
            {day.entries.map((entry) =>
              entry.kind === "gap" ? (
                <GapRow
                  entry={entry}
                  key={`gap-${entry.gap.startAt}`}
                  onLog={() => {
                    setSheet({ endAt: entry.gap.endAt, kind: "log", startAt: entry.gap.startAt });
                  }}
                />
              ) : (
                <ActivityRow
                  key={`${entry.row.activityId}-${entry.row.startAt}`}
                  onEdit={() => {
                    setSheet({
                      activityId: entry.row.activityId,
                      category: entry.row.category,
                      endAt: entry.row.isRunning ? null : entry.row.endAt,
                      kind: "edit",
                      label: entry.row.label,
                      startAt: entry.row.startAt,
                    });
                  }}
                  row={entry.row}
                  zone={day.zone}
                />
              ),
            )}
          </ul>
        )}
      </section>
      <div className="px-5">
        <Button
          onClick={() => {
            const until = end(new Date(Date.parse(day.date) + 86_400_000).toISOString());
            setSheet({
              endAt: until,
              kind: "log",
              startAt: new Date(Date.parse(until) - 30 * 60_000).toISOString(),
            });
          }}
          variant="outline"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("day.logPast")}
        </Button>
      </div>
      {sheet !== null && (
        <ActivitySheet
          onClose={() => {
            setSheet(null);
          }}
          target={sheet}
          zone={day.zone}
        />
      )}
    </main>
  );
};
