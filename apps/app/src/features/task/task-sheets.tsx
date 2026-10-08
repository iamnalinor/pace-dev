import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";

/** Title and description as the user typed them; the rest is edited on the web. */
export const EditTextSheet = ({
  onClose,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const [title, setTitle] = useState(view.title);
  const [description, setDescription] = useState(view.description ?? "");
  const isTitleMissing = title.trim() === "";
  const save = async (): Promise<void> => {
    const patch = {
      ...(title !== view.title && { title }),
      ...(description !== (view.description ?? "") && {
        description: description === "" ? null : description,
      }),
    };
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    if (await run(actions.updateTask(view.id, patch))) {
      onClose();
    }
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("edit.title")} visible>
      <TextField
        error={isTitleMissing ? t("edit.titleRequired") : null}
        label={t("edit.taskTitle")}
        onChangeText={setTitle}
        value={title}
      />
      <TextField
        label={t("edit.description")}
        multiline
        onChangeText={setDescription}
        value={description}
      />
      <SheetActions
        cancelLabel={t("common.cancel")}
        isDisabled={isTitleMissing}
        onCancel={onClose}
        onPrimary={() => {
          void save();
        }}
        primaryLabel={t("common.save")}
      />
    </Sheet>
  );
};
