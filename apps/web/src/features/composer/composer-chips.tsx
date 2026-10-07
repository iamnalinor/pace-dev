import { useState } from "react";

import type { ComposerEdits, ComposerModel } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { ImportanceChips } from "#web/shared/ui/importance-chips.tsx";

import { type ComposerField, FieldChips } from "./field-chips.tsx";
import { FieldEditor } from "./field-editor.tsx";

type Props = {
  readonly model: ComposerModel;
  readonly onEdit: (edits: ComposerEdits) => void;
};

/**
How the line was read: category and importance as one-tap rows, the other fields as chips
that open their choices underneath.
*/
export const ComposerChips = ({ model, onEdit }: Props) => {
  const t = useT();
  const [open, setOpen] = useState<ComposerField | null>(null);
  return (
    <div className="grid gap-2 px-1 pb-1">
      <ChipGroup
        label={t("composer.category")}
        onChange={(presetId) => {
          // A new category brings its own default importance unless the line names one.
          onEdit({ importance: undefined, presetId });
        }}
        options={model.presets.map((preset) => ({
          color: preset.color,
          label: preset.name,
          value: preset.id,
        }))}
        value={model.preset.id}
      />
      <ImportanceChips
        onChange={(importance) => {
          onEdit({ importance });
        }}
        value={model.importance}
      />
      <FieldChips model={model} onOpen={setOpen} open={open} />
      {open !== null && <FieldEditor field={open} model={model} onEdit={onEdit} />}
    </div>
  );
};
