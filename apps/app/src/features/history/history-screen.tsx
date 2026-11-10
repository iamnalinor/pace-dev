import type { HistoryEntry, HistoryError, HistoryViewModel, NowRow } from "@pace/client";
import type { HistoryResource } from "@pace/client/react";

import { useIsAccountUnknown, usePace, useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { zonedText } from "#app/format/time.ts";
import { PeriodStepper } from "#app/shared/period-stepper.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { useBlockRetry } from "#app/shared/use-block-retry.ts";
import { instantParam, useSearchParam } from "#app/shared/use-search-param.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { type ListSection, SectionedList } from "#app/ui/sectioned-list.tsx";
import { Skeleton } from "#app/ui/skeleton.tsx";
import { useSyncRetryReason } from "#app/ui/sync-frame.tsx";
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

type Pending =
  | { readonly status: "failed"; readonly error: HistoryError; readonly retry: () => void }
  | { readonly status: "loading" };

/**
The complete source is still loading, or its load failed: never an empty board in its place, since
a partial copy (a checkpoint and its tail) cannot say what the board was. A failure says so at once;
its Retry is the sync line's while that offers one (QA PR55-1-09), and the load runs again when
the line goes.
*/
const HistoryPending = ({ resource }: { readonly resource: Pending }) => {
  const t = useT();
  const retry = useBlockRetry({
    isFailed: resource.status === "failed",
    retry: resource.status === "failed" ? resource.retry : NOTHING,
  });
  return resource.status === "loading" ? (
    <Skeleton label={t("history.loading")} rows={6} />
  ) : (
    <EmptyState
      action={
        retry === null ? null : (
          <Button onPress={retry} size="small" variant="secondary">
            {t("common.retry")}
          </Button>
        )
      }
      isKnown
      title={errorText(t, resource.error)}
    />
  );
};

const NOTHING = (): void => undefined;

/**
What the page shows of the history: a copy whose first sync ended without success holds none of the
account, so its empty history is no answer; the page says the history did not load, not grey rows
for good (QA PR55-1-02). The sync line's Retry loads it; once a pull succeeds, the history shows.
*/
const usePageHistory = (history: HistoryResource): HistoryResource | Pending => {
  const isUnknown = useIsAccountUnknown();
  const reason = useSyncRetryReason();
  if (!isUnknown || reason === null || history.status !== "ready") {
    return history;
  }
  return {
    error: reason === "offline" ? "history/offline" : "history/unavailable",
    retry: NOTHING,
    status: "failed",
  };
};

/** The snapshot of the board at the moment, then the events up to `at` (all of them at "now"). */
const historySections = (
  history: HistoryViewModel,
  { at, when }: { readonly at: null | string; readonly when: string },
  t: ReturnType<typeof useT>,
): readonly ListSection<Row>[] => {
  // At "now" every event shows (the clock ticks by the minute; a fresh undo is not later).
  const events =
    at === null
      ? history.events
      : history.events.filter((entry) => Date.parse(entry.occurredAt) <= Date.parse(at));
  return [
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
};

/** The moment the address asks for; a malformed one, or one not yet come, is now (`null`). */
const momentOf = (param: null | string, now: string): null | string => {
  const asked = instantParam(param);
  return asked !== null && Date.parse(asked) < Date.parse(now) ? asked : null;
};

/** ‹ the moment › and «Today» away from now, in the header's period slot. */
const MomentStepper = ({
  at,
  now,
  onAt,
  when,
  shortWhen,
}: {
  readonly at: null | string;
  readonly now: string;
  readonly onAt: (at: null | string) => void;
  readonly when: string;
  readonly shortWhen: string;
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
      shortLabel={shortWhen}
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
  // The moment is in the address (`?at=<instant>`, feedback 5 item 6).
  const [atParam, setAt] = useSearchParam("at");
  const at = momentOf(atParam, now);
  const instant = at ?? now;
  const history = usePageHistory(hooks.useHistory(instant));
  const when = zonedText({ at: instant, mode: "datetime", tz: viewer.deviceTz }, viewer);
  const shortWhen = new Intl.DateTimeFormat(viewer.language, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    timeZone: viewer.deviceTz,
  }).format(new Date(instant));
  const sections =
    history.status === "ready" ? historySections(history.value, { at, when }, t) : [];
  return (
    <Screen
      header={
        <ScreenHeader
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          period={
            <MomentStepper at={at} now={now} onAt={setAt} shortWhen={shortWhen} when={when} />
          }
          title={t("history.title")}
          variant="top"
        />
      }
      scroller={(scroll) => (
        <SectionedList
          empty={
            history.status === "ready" ? (
              <EmptyState title={t(at === null ? "history.emptyAccount" : "history.emptyAt")} />
            ) : (
              <HistoryPending resource={history} />
            )
          }
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
