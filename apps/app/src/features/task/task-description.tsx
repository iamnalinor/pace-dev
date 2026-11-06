import { useState } from "react";
import { View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { Text } from "#app/ui/text.tsx";

/** Lines of the description before «Show all». */
const DESCRIPTION_LINES = 6;
const LONG_DESCRIPTION = 240;

const DescriptionEditor = ({
  draft,
  isSaving,
  onCancel,
  onChange,
  onSave,
}: {
  readonly draft: string;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onChange: (text: string) => void;
  readonly onSave: () => void;
}) => {
  const t = useT();
  return (
    <View className="mx-gutter gap-3">
      <TextField
        autoFocus
        editable={!isSaving}
        label={t("edit.description")}
        maxLength={4000}
        multiline
        onChangeText={onChange}
        value={draft}
      />
      <View className="flex-row justify-end gap-2">
        <Button disabled={isSaving} onPress={onCancel} size="small" variant="plain">
          {t("common.cancel")}
        </Button>
        <Button busy={isSaving} onPress={onSave} size="small">
          {t("common.save")}
        </Button>
      </View>
    </View>
  );
};

/** Saves the draft as the description (empty clears it); closes the editor when it went through. */
const useSaveDescription = (view: TaskViewModel, close: () => void) => {
  const { actions } = usePace();
  const run = useRunAction();
  const [isSaving, setIsSaving] = useState(false);
  const save = async (draft: string): Promise<void> => {
    if (isSaving) {
      return;
    }
    const description = draft.trim() === "" ? null : draft;
    if (description === view.description) {
      close();
      return;
    }
    setIsSaving(true);
    try {
      const saving = await run(actions.updateTask(view.id, { description }));
      if (saving.ok) {
        close();
      }
    } finally {
      setIsSaving(false);
    }
  };
  return { isSaving, save };
};

/** The description: six lines and «Show all» when long, a tap to edit, or the row that adds one. */
const DescriptionText = ({
  onEdit,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onEdit: () => void;
}) => {
  const t = useT();
  const [isFull, setIsFull] = useState(false);
  if (view.description === null || view.description === "") {
    return (
      <Pressable
        className="mx-gutter min-h-hit-web justify-center"
        label={t("task.addDescription")}
        onPress={onEdit}
        role="button"
      >
        <Text role="body" tone="tertiary">
          {t("task.addDescription")}
        </Text>
      </Pressable>
    );
  }
  // Only a text that may run past six lines offers the rest (a clamped text cannot say it was cut).
  const isCut = view.description.length > LONG_DESCRIPTION && !isFull;
  return (
    <View className="mx-gutter gap-1">
      <Pressable label={t("task.editDescription")} onPress={onEdit} role="button">
        {isCut ? (
          <Text lines={DESCRIPTION_LINES} policy="clamp" role="body">
            {view.description}
          </Text>
        ) : (
          <Text role="body">{view.description}</Text>
        )}
      </Pressable>
      {isCut ? (
        <Button
          onPress={() => {
            setIsFull(true);
          }}
          size="small"
          variant="plain"
        >
          {t("task.showFull")}
        </Button>
      ) : null}
    </View>
  );
};

/** A quick description edit on the task itself, without opening the full task form. */
export const TaskDescription = ({ view }: { readonly view: TaskViewModel }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const close = (): void => {
    setIsEditing(false);
  };
  const { isSaving, save } = useSaveDescription(view, close);
  if (isEditing) {
    return (
      <DescriptionEditor
        draft={draft}
        isSaving={isSaving}
        onCancel={close}
        onChange={setDraft}
        onSave={() => {
          void save(draft);
        }}
      />
    );
  }
  return (
    <DescriptionText
      onEdit={() => {
        setDraft(view.description ?? "");
        setIsEditing(true);
      }}
      view={view}
    />
  );
};
