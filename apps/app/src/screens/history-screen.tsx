import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import type { HistoryEntry } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { TaskRow } from "#app/shared/task-row.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { addMinutesIso, EVENT_LABEL_KEYS } from "@pace/core";

import { PushedScreen } from "./pushed-screen.tsx";

const MINUTES_PER_DAY = 1440;

const EntryRow = ({ entry }: { readonly entry: HistoryEntry }) => {
  const t = useT();
  const viewer = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="flex-row items-center gap-3 border-t border-line py-2.5">
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-[14px] text-fg">
          {t(EVENT_LABEL_KEYS[entry.type])}
          {entry.taskTitle === null ? "" : ` · ${entry.taskTitle}`}
        </Text>
        <Text className="font-sans text-[12px] text-muted">
          {[
            zonedText({ at: entry.occurredAt, mode: "datetime", tz: viewer.deviceTz }, viewer),
            t(`source.${entry.source}`),
          ].join(" · ")}
        </Text>
      </View>
      {entry.revokedBy === null ? null : (
        <Text className="font-sans text-[12px] text-muted">{t("history.revoked")}</Text>
      )}
      {entry.revocable ? (
        <Button
          onPress={() => {
            void run(actions.revoke(entry.id));
          }}
          variant="ghost"
        >
          {t("common.undo")}
        </Button>
      ) : null}
    </View>
  );
};

/** [Now] [‹] [›]: a day back or forward; nothing after now. */
const DayNav = ({
  at,
  now,
  onAt,
}: {
  readonly at: null | string;
  readonly now: string;
  readonly onAt: (at: null | string) => void;
}) => {
  const t = useT();
  const instant = at ?? now;
  const later = addMinutesIso(instant, MINUTES_PER_DAY);
  return (
    <View className="flex-row items-center gap-1 px-4 pb-3">
      <Button
        disabled={at === null}
        onPress={() => {
          onAt(null);
        }}
        variant="secondary"
      >
        {t("history.now")}
      </Button>
      <IconButton
        icon={ChevronLeft}
        label={t("history.dayBack")}
        onPress={() => {
          onAt(addMinutesIso(instant, -MINUTES_PER_DAY));
        }}
        variant="plain"
      />
      <IconButton
        disabled={at === null}
        icon={ChevronRight}
        label={t("history.dayForward")}
        onPress={() => {
          onAt(Date.parse(later) >= Date.parse(now) ? null : later);
        }}
        variant="plain"
      />
    </View>
  );
};

/**
The board as it was at a chosen moment (its date in the label), and every change up to then,
each one undoable.
*/
export const HistoryScreen = () => {
  const t = useT();
  const viewer = useViewer();
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
  return (
    <PushedScreen title={t("history.title")}>
      <DayNav at={at} now={now} onAt={setAt} />
      <Text className="px-5 pb-1 font-sans text-[12px] font-medium text-muted">
        {`${t("history.boardAt")} ${when}`}
      </Text>
      <View className="px-2">
        {history.board.rows.map((row) => (
          <TaskRow
            asOf={instant}
            key={row.id}
            onOpen={() => {
              openTask(row.id);
            }}
            row={row}
          />
        ))}
      </View>
      <View className="px-5 pt-4">
        <Text className="pb-1 font-sans text-[12px] font-medium text-muted">
          {at === null ? t("history.events") : t("history.eventsUntil", { when })}
        </Text>
        {history.board.rows.length === 0 && events.length === 0 ? (
          <Text className="py-2 font-sans text-[14px] text-muted">{t("history.emptyAt")}</Text>
        ) : null}
        {events.map((entry) => (
          <EntryRow entry={entry} key={entry.id} />
        ))}
      </View>
    </PushedScreen>
  );
};
