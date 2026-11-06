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
import { EmptyText } from "#app/ui/empty-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { addMinutesIso } from "@pace/core";

import { DestinationScreen } from "./destination-screen.tsx";

const MINUTES_PER_DAY = 1440;

/** Asks before an event is undone; it names the event and its task under the question. */
const UndoConfirmation = ({
  isBusy,
  onClose,
  onUndo,
  subtitle,
}: {
  readonly isBusy: boolean;
  readonly onClose: () => void;
  readonly onUndo: () => void;
  readonly subtitle: string;
}) => {
  const t = useT();
  return (
    <Sheet
      closeLabel={t("common.close")}
      footer={
        <SheetActions
          cancelLabel={t("common.cancel")}
          isBusy={isBusy}
          onCancel={onClose}
          onPrimary={onUndo}
          primaryLabel={t("history.undoConfirm")}
        />
      }
      name="history-undo"
      onClose={onClose}
      open
      subtitle={subtitle}
      title={t("history.undoConfirm")}
    >
      <Text className="pb-4 font-sans text-subhead font-normal text-label-primary">
        {t("history.undoConfirmQuestion")}
      </Text>
    </Sheet>
  );
};

const LINE = "font-sans text-subhead font-normal text-label-primary";
const META = "font-sans text-caption font-normal text-label-tertiary";

const EntryRow = ({ entry }: { readonly entry: HistoryEntry }) => {
  const t = useT();
  const viewer = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const eventLabel = t(entry.labelKey);
  const closeConfirmation = () => {
    if (!isBusy) {
      setIsConfirming(false);
    }
  };
  const undo = async () => {
    setIsBusy(true);
    try {
      const revocation = await run(actions.revoke(entry.id));
      if (revocation.ok) {
        setIsConfirming(false);
      }
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <View className="gap-2 border-t border-separator py-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className={LINE}>
            {eventLabel}
            {entry.taskTitle === null ? "" : ` · ${entry.taskTitle}`}
          </Text>
          <Text className={META}>
            {[
              zonedText({ at: entry.occurredAt, mode: "datetime", tz: viewer.deviceTz }, viewer),
              t(`source.${entry.source}`),
            ].join(" · ")}
          </Text>
        </View>
        {entry.revokedBy === null ? null : <Text className={META}>{t("history.revoked")}</Text>}
        {/* Undo stays while the dialog asks, so the dialog gives focus back to it (bug class 5). */}
        {entry.revocable ? (
          <Button
            onPress={() => {
              setIsConfirming(true);
            }}
            variant="plain"
          >
            {t("common.undo")}
          </Button>
        ) : null}
      </View>
      <OverlayPresence value={isConfirming && entry.revocable ? true : null}>
        {() => (
          <UndoConfirmation
            isBusy={isBusy}
            onClose={closeConfirmation}
            onUndo={() => {
              void undo();
            }}
            subtitle={entry.taskTitle === null ? eventLabel : `${eventLabel} · ${entry.taskTitle}`}
          />
        )}
      </OverlayPresence>
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
        icon={"chevron-left"}
        label={t("history.dayBack")}
        onPress={() => {
          onAt(addMinutesIso(instant, -MINUTES_PER_DAY));
        }}
      />
      <IconButton
        disabled={at === null}
        icon={"chevron-right"}
        label={t("history.dayForward")}
        onPress={() => {
          onAt(Date.parse(later) >= Date.parse(now) ? null : later);
        }}
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
    <DestinationScreen title={t("history.title")}>
      <DayNav at={at} now={now} onAt={setAt} />
      <Text className="px-5 pb-1 font-sans text-caption text-label-tertiary">
        {`${t("history.boardAt")} ${when}`}
      </Text>
      <Group separatorInset="check">
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
      </Group>
      <View className="px-5 pt-4">
        <Text className="pb-1 font-sans text-caption text-label-tertiary">
          {at === null ? t("history.events") : t("history.eventsUntil", { when })}
        </Text>
        {history.board.rows.length === 0 && events.length === 0 ? (
          <EmptyText className="py-2 font-sans text-subhead font-normal text-label-secondary">
            {t("history.emptyAt")}
          </EmptyText>
        ) : null}
        {events.map((entry) => (
          <EntryRow entry={entry} key={entry.id} />
        ))}
      </View>
    </DestinationScreen>
  );
};
