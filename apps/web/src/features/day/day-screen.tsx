import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import type { DayEntry, DayModel, DayRowProps } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatTime } from "#web/shared/format/time.ts";
import { formatEyebrow } from "#web/shared/lib/eyebrow.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ColorTag } from "#web/shared/ui/color-tag.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";

const ActivityRow = ({ onEdit, row, zone }: DayRowProps) => {
  const t = useT();
  const language = useLanguage();
  return (
    <li className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="w-22 shrink-0 pt-0.5 font-mono text-xs text-muted">
        {formatTime(row.startAt, zone, language)}–
        {row.isRunning ? "" : formatTime(row.endAt, zone, language)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          <span className="truncate font-medium">{row.label}</span>
          {row.isRunning && <span className="text-xs text-accentText">{t("day.running")}</span>}
        </span>
        {row.taskId !== null && row.taskTitle !== null && (
          <Link
            className="truncate text-xs text-fg2 underline-offset-2 hover:underline"
            to={`/task/${row.taskId}`}
          >
            {row.taskTitle}
          </Link>
        )}
      </div>
      <span className="pt-0.5 font-mono text-xs text-fg2">
        {formatMinutes(row.minutes, language)}
      </span>
      <Button
        aria-label={t("day.edit", { label: row.label })}
        onClick={onEdit}
        size="sm"
        variant="ghost"
      >
        {t("common.edit")}
      </Button>
    </li>
  );
};

const GapRow = ({ minutes, onLog }: { readonly minutes: number; readonly onLog: () => void }) => {
  const t = useT();
  const language = useLanguage();
  return (
    <li className="my-1 flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
      {t("day.gap", { duration: formatMinutes(minutes, language) })}
      <Button onClick={onLog} size="sm" variant="outline">
        {t("day.logGap")}
      </Button>
    </li>
  );
};

/** Previous day, back to today, next day (none past today). */
const DayNav = ({
  day,
  onDate,
}: {
  readonly day: DayModel;
  readonly onDate: (date: null | string) => void;
}) => {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={t("day.previous")}
        onClick={() => {
          onDate(day.previous);
        }}
        size="icon"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {!day.isToday && (
        <Button
          onClick={() => {
            onDate(null);
          }}
          size="sm"
          variant="outline"
        >
          {t("day.today")}
        </Button>
      )}
      <Button
        aria-label={t("day.next")}
        disabled={day.next === null}
        onClick={() => {
          onDate(day.next);
        }}
        size="icon"
        variant="ghost"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
};

/** The day's blocks and the gaps between them, in time order. */
const Entries = ({
  entries,
  onOpen,
  zone,
}: {
  readonly entries: readonly DayEntry[];
  readonly zone: string;
  readonly onOpen: (target: SheetTarget) => void;
}) => (
  <ul>
    {entries.map((entry) => {
      const open = (): void => {
        onOpen(entry.target);
      };
      return entry.kind === "gap" ? (
        <GapRow key={entry.key} minutes={entry.gap.minutes} onLog={open} />
      ) : (
        <ActivityRow key={entry.key} onEdit={open} row={entry.row} zone={zone} />
      );
    })}
  </ul>
);

/** One day of the time ledger: totals per category, the timeline with its gaps, edits. */
export const DayScreen = () => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const [date, setDate] = useState<null | string>(null);
  const [sheet, setSheet] = useState<null | SheetTarget>(null);
  const day = hooks.useDay(date);
  return (
    <main className="flex flex-1 flex-col gap-3 pb-6">
      <PageHeader
        action={<DayNav day={day} onDate={setDate} />}
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
          <Entries entries={day.entries} onOpen={setSheet} zone={day.zone} />
        )}
      </section>
      <div className="px-5">
        <Button
          onClick={() => {
            setSheet(day.logTarget);
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
