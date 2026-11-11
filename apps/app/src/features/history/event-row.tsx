import { useState } from "react";

import type { HistoryEntry } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useBusyLatch } from "#app/shared/use-busy-latch.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { Text } from "#app/ui/text.tsx";

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
      <Text className="pb-4" role="body">
        {t("history.undoConfirmQuestion")}
      </Text>
    </Sheet>
  );
};

/** Asking before an undo, and the undo itself: busy while the revoke runs, closed once it went through. */
const useUndo = (entry: HistoryEntry) => {
  const { actions } = usePace();
  const run = useRunAction();
  const [isConfirming, setIsConfirming] = useState(false);
  // Two presses of the confirm in one frame both saw it idle and revoked twice (class 374).
  const latch = useBusyLatch();
  return {
    ask: (): void => {
      setIsConfirming(true);
    },
    close: (): void => {
      if (!latch.isBusy) {
        setIsConfirming(false);
      }
    },
    isBusy: latch.isBusy,
    isConfirming,
    undo: async (): Promise<void> => {
      await latch.run(async () => {
        // A row of several revocations written together is undone together (R26-10).
        const revocation = await run(
          entry.ids.length > 1 ? actions.revokeAll(entry.ids) : actions.revoke(entry.id),
        );
        if (revocation.ok) {
          setIsConfirming(false);
        }
      });
    },
  };
};

/**
One event: its sentence, when and from where. A task's latest undoable event carries the one
visible «Undo» (F-CMP-14); any other undoable row is itself the way in (a press asks the same
question), so no row holds a button inside a button.
*/
export const EventRow = ({
  entry,
  isLatest,
}: {
  readonly entry: HistoryEntry;
  readonly isLatest: boolean;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { ask, close, isBusy, isConfirming, undo } = useUndo(entry);
  const eventLabel = t(entry.labelKey);
  const sentence = entry.taskTitle === null ? eventLabel : `${eventLabel} · ${entry.taskTitle}`;
  let trailing = null;
  if (entry.revokedBy !== null) {
    trailing = (
      <Text role="footnote" tone="secondary">
        {t("history.revoked")}
      </Text>
    );
  } else if (isLatest) {
    // Undo stays while the dialog asks, so the dialog gives focus back to it (bug class 5).
    trailing = (
      <Button
        // One verb with the question it asks («Вернуть как было»; Undo is «Вернуть» everywhere,
        // QA round 14 M2), and the row it undoes in its name (QA round 25 R25-05).
        label={t("history.undoRow", { event: sentence })}
        onPress={ask}
        size="small"
        variant="plain"
      >
        {t("common.undo")}
      </Button>
    );
  }
  const isAsked = entry.revokedBy === null && entry.revocable && !isLatest;
  return (
    <>
      <ListRow
        subtitle={[
          zonedText({ at: entry.occurredAt, mode: "datetime", tz: viewer.deviceTz }, viewer),
          t(`source.${entry.source}`),
        ].join(" · ")}
        title={sentence}
        titleLines={2}
        trailing={trailing}
        {...(isAsked && {
          label: t("history.undoRow", { event: sentence }),
          onPress: ask,
          role: "button" as const,
        })}
      />
      <OverlayPresence value={isConfirming && entry.revocable ? true : null}>
        {() => (
          <UndoConfirmation
            isBusy={isBusy}
            onClose={close}
            onUndo={() => {
              void undo();
            }}
            subtitle={sentence}
          />
        )}
      </OverlayPresence>
    </>
  );
};
