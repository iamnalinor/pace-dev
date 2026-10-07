import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import type { InboxCard as Card } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { revokeEvents, showUndoToast } from "#web/shared/lib/undo-toast.ts";
import { Button } from "#web/shared/ui/button.tsx";

import type { SuggestionEdits } from "./suggestion-chips.ts";

import { InboxCard } from "./inbox-card.tsx";
import { QuickCapture } from "./quick-capture.tsx";

/** The inbox (artboard 6): every capture with its guess, sorted one by one or all at once. */
export const InboxView = () => {
  const t = useT();
  const { actions, hooks } = useServices();
  const inbox = hooks.useInbox();
  const [edits, setEdits] = useState<Readonly<Record<string, SuggestionEdits>>>({});

  const accept = async (card: Card): Promise<boolean> => {
    const result = await actions.acceptSuggestion(card.id, card.suggestion, edits[card.id]);
    if (!result.ok) {
      toast.error(actionErrorText(t, result.error));
    }
    return result.ok;
  };

  const acceptOne = async (card: Card): Promise<void> => {
    if (await accept(card)) {
      toast(t("inbox.accepted"));
    }
  };

  const acceptAll = async (): Promise<void> => {
    for (const card of inbox.cards) {
      // One after the other: each acceptance is validated against the state the previous left.

      if (!(await accept(card))) {
        return;
      }
    }
    toast(t("inbox.accepted"));
  };

  const remove = async (card: Card): Promise<void> => {
    const result = await actions.discardInbox(card.id);
    if (!result.ok) {
      toast.error(actionErrorText(t, result.error));
      return;
    }
    showUndoToast({
      message: t("inbox.deleted"),
      onUndo: () => {
        void revokeEvents(actions.revoke, result.value);
      },
      undoLabel: t("common.undo"),
    });
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 pt-3.5 pr-4 pb-2.5 pl-2">
        <Button aria-label={t("common.back")} asChild size="icon" variant="ghost">
          <Link to="/">
            <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
        <h1 className="text-[22px] font-semibold">{t("inbox.title")}</h1>
        <span className="ml-1.5 font-mono text-[13px] text-muted">{inbox.count}</span>
        {inbox.count > 0 && (
          <Button
            className="ml-auto"
            onClick={() => {
              void acceptAll();
            }}
            size="sm"
            variant="accent"
          >
            {t("inbox.acceptAll")}
          </Button>
        )}
      </header>
      <p className="mx-5 mb-3 text-xs text-muted">{t("inbox.hint")}</p>
      {inbox.count === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{t("inbox.empty")}</p>
      ) : (
        <ul aria-label={t("inbox.title")} className="flex flex-col gap-2.5 px-4">
          {inbox.cards.map((card) => (
            <InboxCard
              card={card}
              edits={edits[card.id]}
              key={card.id}
              onAccept={() => {
                void acceptOne(card);
              }}
              onDelete={() => {
                void remove(card);
              }}
              onEdit={(next) => {
                setEdits({ ...edits, [card.id]: { ...edits[card.id], ...next } });
              }}
            />
          ))}
        </ul>
      )}
      <div className="min-h-6 flex-1" />
      <QuickCapture />
    </div>
  );
};
