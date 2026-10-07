import { useState } from "react";
import { View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";

export type MenuChoice = "close-as" | "edit";

/** The "more" menu: edit the text, or close the task as cancelled or skipped. */
export const TaskMenuSheet = ({
  onChoose,
  onClose,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onClose: () => void;
  readonly onChoose: (choice: MenuChoice) => void;
}) => {
  const t = useT();
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("task.menuTitle")} visible>
      <Button
        onPress={() => {
          onChoose("edit");
        }}
        variant="secondary"
      >
        {t("task.edit")}
      </Button>
      {view.closed === null ? (
        <Button
          onPress={() => {
            onChoose("close-as");
          }}
          variant="secondary"
        >
          {t("close.other")}
        </Button>
      ) : null}
    </Sheet>
  );
};

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
    if (await run(actions.updateTask(view.id, patch), { success: t("edit.saved"), undo: true })) {
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
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button onPress={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            disabled={isTitleMissing}
            onPress={() => {
              void save();
            }}
          >
            {t("common.save")}
          </Button>
        </View>
      </View>
    </Sheet>
  );
};
