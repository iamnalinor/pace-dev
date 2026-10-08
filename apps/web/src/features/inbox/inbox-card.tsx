import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { InboxCard as Card } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { tagClass } from "#web/shared/ui/color-tag.tsx";
import { IMPORTANCE_COLORS, type ProjectColorName } from "@pace/core";

import { formatAge } from "./age.ts";
import { ChipPicker } from "./chip-picker.tsx";
import {
  CHIP_FIELDS,
  type ChipField,
  editedSuggestion,
  type SuggestionEdits,
} from "./suggestion-chips.ts";
import { useChipText } from "./use-chip-text.ts";

type Props = {
  readonly card: Card;
  readonly edits: SuggestionEdits | undefined;
  readonly onEdit: (edits: SuggestionEdits) => void;
  readonly onAccept: () => void;
  readonly onDelete: () => void;
};

const CHANGE_KEY = {
  due: "inbox.changeDue",
  importance: "inbox.changeImportance",
  preset: "inbox.changePreset",
  project: "inbox.changeProject",
} as const;

/** One capture: the text as typed, its age, the guessed fields as chips, Accept and Delete. */
export const InboxCard = ({ card, edits, onAccept, onDelete, onEdit }: Props) => {
  const t = useT();
  const chips = useChipText();
  const [open, setOpen] = useState<ChipField | null>(null);
  const suggestion = editedSuggestion(card.suggestion, edits);
  /** Each guessed field in its own colour: the project's, the category's, the importance's. */
  const colorOf = (field: ChipField): null | ProjectColorName => {
    switch (field) {
      case "importance": {
        return IMPORTANCE_COLORS[suggestion.importance];
      }
      case "preset": {
        return chips.presetColor(suggestion);
      }
      case "project": {
        return suggestion.projectId === null ? null : chips.color(suggestion);
      }
      case "due": {
        return null;
      }
    }
  };
  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-surface p-3.5",
        card.tooLong && "border-warn/40",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[15px] wrap-break-word">{card.text}</span>
        <span className={cn("shrink-0 text-[11px] text-faint", card.tooLong && "text-warn")}>
          {formatAge(card.ageMinutes, t)}
          {card.tooLong && ` · ${t("inbox.tooLong")}`}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {CHIP_FIELDS.map((field) => {
          const text = chips.text(field, suggestion);
          return (
            <button
              aria-expanded={open === field}
              aria-label={t(CHANGE_KEY[field], { value: text })}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
                tagClass(colorOf(field)),
                open === field && "ring-1 ring-fg2",
              )}
              key={field}
              onClick={() => {
                setOpen(open === field ? null : field);
              }}
              type="button"
            >
              {text}
            </button>
          );
        })}
      </div>
      {open !== null && (
        <div className="mt-2.5">
          <ChipPicker field={open} onEdit={onEdit} suggestion={suggestion} />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onAccept}>
          {t("common.accept")}
        </Button>
        <Button
          aria-label={t("inbox.deleteLabel", { text: card.text })}
          onClick={onDelete}
          size="icon"
          variant="secondary"
        >
          <Trash2 aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </div>
    </li>
  );
};
