import { useState } from "react";

import type { HistoryEntry, NowRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { PeriodStepper } from "#app/shared/period-stepper.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { type ListSection, SectionedList } from "#app/ui/sectioned-list.tsx";
import { addMinutesIso } from "@pace/core";

import { EventRow } from "./event-row.tsx";
import { SnapshotRow } from "./snapshot-row.tsx";

const MINUTES_PER_DAY = 1440;

type Row =
  | { readonly kind: "event"; readonly entry: HistoryEntry; readonly isLatest: boolean }
  | { readonly kind: "task"; readonly row: NowRow };

const rowKey = (row: Row): string => (row.kind === "event" ? row.entry.id : `task:${row.row.id}`);

/**
The one event of a task that offers a visible Undo: its latest undoable one (F-CMP-14). Newest
first, so the first undoable event met for a task is it. An event of no task stands alone.
*/
const withLatest = (events: readonly HistoryEntry[]): readonly Row[] => {
  const seen = new Set<string>();
  return events.map((entry): Row => {
    const group = entry.taskId ?? `event:${entry.id}`;
    const isLatest = entry.revocable && !seen.has(group);
    if (entry.revocable) {
      seen.add(group);
    }
    return { entry, isLatest, kind: "event" };
  });
};

/** ‹ the moment › and «Today» away from now, in the header's period slot. */
const MomentStepper = ({
  at,
  now,
  onAt,
  when,
}: {
  readonly at: null | string;
  readonly now: string;
  readonly onAt: (at: null | string) => void;
  readonly when: string;
}) => {
  const t = useT();
  const instant = at ?? now;
  const later = addMinutesIso(instant, MINUTES_PER_DAY);
  return (
    <PeriodStepper
      isAway={at !== null}
      label={when}
      nextLabel={t("history.dayForward")}
      onNext={
        at === null
          ? null
          : () => {
              onAt(Date.parse(later) >= Date.parse(now) ? null : later);
            }
      }
      onPrevious={() => {
        onAt(addMinutesIso(instant, -MINUTES_PER_DAY));
      }}
      onToday={() => {
        onAt(null);
      }}
      previousLabel={t("history.dayBack")}
      todayLabel={t("period.today")}
    />
  );
};

/**
The board as it was at a chosen moment (its date in the stepper), and every change up to then:
the snapshot, then the events, each undoable (spec §5.14).
*/
export const HistoryScreen = () => {
  const t = useT();
  const viewer = useViewer();
  const back = useBack();
  const openTask = useOpenTask();
  const { hooks } = usePace();
  const { now } = hooks.useClock();
  const [at, setAt] = useState<null | string>(null);
  const instant = at ?? now;
  const history = hooks.useHistory(instant);
  const when = zonedText({ at: instant, mode: "datetime", tz: viewer.deviceTz }, viewer);
  // At "now" every event shows (the clock ticks by the minute; a fresh undo is not later).
  const events =
    at === null
      ? history.events
      : history.events.filter((entry) => Date.parse(entry.occurredAt) <= Date.parse(at));
  const sections: readonly ListSection<Row>[] = [
    {
      key: "tasks",
      rows: history.board.rows.map((row): Row => ({ kind: "task", row })),
      title: t("history.snapshot", { when }),
    },
    {
      key: "events",
      rows: withLatest(events),
      title: at === null ? t("history.events") : t("history.eventsUntil", { when }),
    },
  ];
  return (
    <Screen
      header={
        <ScreenHeader
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          period={<MomentStepper at={at} now={now} onAt={setAt} when={when} />}
          title={t("history.title")}
          variant="top"
        />
      }
      scroller={(scroll) => (
        <SectionedList
          empty={<EmptyState title={t(at === null ? "history.emptyAccount" : "history.emptyAt")} />}
          renderRow={(row) =>
            row.kind === "event" ? (
              <EventRow entry={row.entry} isLatest={row.isLatest} />
            ) : (
              <SnapshotRow
                asOf={instant}
                onOpen={() => {
                  openTask(row.row.id);
                }}
                row={row.row}
              />
            )
          }
          rowKey={rowKey}
          scroll={scroll}
          sections={sections}
        />
      )}
    />
  );
};
