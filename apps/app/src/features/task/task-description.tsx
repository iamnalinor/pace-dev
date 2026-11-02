import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

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
    <View className="mx-5 gap-3 rounded-xl border border-separator bg-cell p-4">
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
        <Pressable
          accessibilityRole="button"
          className="min-h-hit-web justify-center rounded-lg px-4"
          disabled={isSaving}
          onPress={onCancel}
        >
          <Text className="font-sans text-footnote text-label-secondary">{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-hit-web justify-center rounded-lg bg-accent px-4"
          disabled={isSaving}
          onPress={onSave}
        >
          <Text className="font-sans text-footnote font-semibold text-accent-on">
            {t("common.save")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

/** A quick description edit on the task itself, without opening the full task form. */
export const TaskDescription = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const { palette } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const hasDescription = view.description !== null && view.description !== "";
  const close = (): void => {
    setIsEditing(false);
  };
  const save = async (): Promise<void> => {
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
      if (await run(actions.updateTask(view.id, { description }))) {
        close();
      }
    } finally {
      setIsSaving(false);
    }
  };
  if (isEditing) {
    return (
      <DescriptionEditor
        draft={draft}
        isSaving={isSaving}
        onCancel={close}
        onChange={setDraft}
        onSave={() => {
          void save();
        }}
      />
    );
  }
  return (
    <Pressable
      accessibilityLabel={t(hasDescription ? "task.editDescription" : "task.addDescription")}
      accessibilityRole="button"
      className="mx-5 min-h-hit-web flex-row items-start gap-2 rounded-lg py-2"
      onPress={() => {
        setDraft(view.description ?? "");
        setIsEditing(true);
      }}
    >
      <Text
        className={
          hasDescription
            ? "min-w-0 flex-1 font-sans text-subhead font-normal text-label-secondary"
            : "min-w-0 flex-1 font-sans text-subhead font-normal text-label-tertiary"
        }
      >
        {hasDescription ? view.description : t("task.addDescription")}
      </Text>
      <Pencil color={palette["label.secondary"]} size={15} strokeWidth={1.8} />
    </Pressable>
  );
};
