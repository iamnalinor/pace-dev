import { useState } from "react";
import { toast } from "sonner";

import type { ReviewRow } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { showUndoToast } from "#web/shared/lib/undo-toast.ts";
import { formatRelativeDay, type ReviewActionKey } from "@pace/core";

import { ReviewCard } from "./review-card.tsx";

/** The "to sort" block: what the system could not settle alone, each with its outcomes. */
export const ReviewList = () => {
  const t = useT();
  const language = useLanguage();
  const { actions, hooks } = useServices();
  const review = hooks.useReview();
  const ctx = hooks.useClock();
  const settings = hooks.useSettings();
  // "Keep open" writes nothing, so the card is hidden locally until the next visit.
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const rows = review.items.filter((row) => !dismissed.includes(row.taskId));
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted">{t("review.empty")}</p>;
  }
  const zone = settings.timezone ?? ctx.deviceTz;

  const run = async (row: ReviewRow, key: ReviewActionKey): Promise<void> => {
    const result = await actions.runReviewAction(row.item, key);
    if (!result.ok) {
      toast.error(actionErrorText(t, result.error));
      return;
    }
    setDismissed((current) => [...current, row.taskId]);
    if (result.value.length > 0) {
      showUndoToast({
        message: t("review.applied"),
        onUndo: () => {
          void actions.undoLast();
        },
        undoLabel: t("common.undo"),
      });
    }
  };

  return (
    <ul aria-label={t("review.title")} className="grid gap-2.5 px-4">
      {rows.map((row) => (
        <ReviewCard
          key={row.taskId}
          onAction={(key) => {
            void run(row, key);
          }}
          row={row}
          since={formatRelativeDay(row.since, ctx.now, { language, tz: zone })}
        />
      ))}
    </ul>
  );
};
