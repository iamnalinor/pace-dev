import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** A problem the task already has; a sent one is on the record and cannot be taken off. */
export type KeptSubtask = { readonly id: string; readonly label: string; readonly isSent: boolean };

const NONE: readonly KeptSubtask[] = [];

/** The look of a chip in the list; one that can be taken off shows an ×. */
const CHIP = "h-8 flex-row items-center gap-1 rounded-pill border-2 border-line px-3";

/**
The problems: those a task already has (kept; unsent ones can be taken off), the new ones
(each removable), and a line to add one more. The composer's form and the task editor both
draw it.
*/
export const SubtaskList = ({
  items,
  kept = NONE,
  onChange,
  onRemoveKept,
}: {
  readonly kept?: readonly KeptSubtask[];
  readonly items: readonly string[];
  readonly onChange: (items: readonly string[]) => void;
  readonly onRemoveKept?: (id: string) => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const [draft, setDraft] = useState("");
  const add = (): void => {
    const label = draft.trim();
    if (label === "") {
      return;
    }

    onChange([...items, label]);
    setDraft("");
  };
  return (
    <View className="gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{t("form.subtasks")}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {kept.map((subtask) =>
          onRemoveKept === undefined || subtask.isSent ? (
            <View className={`${CHIP} bg-raised`} key={subtask.id}>
              <Text className="font-sans text-[13px] text-fg2">{subtask.label}</Text>
            </View>
          ) : (
            <Pressable
              accessibilityLabel={t("form.removeSubtask", { label: subtask.label })}
              accessibilityRole="button"
              className={`${CHIP} bg-raised pr-2 active:opacity-70`}
              key={subtask.id}
              onPress={() => {
                onRemoveKept(subtask.id);
              }}
            >
              <Text className="font-sans text-[13px] text-fg2">{subtask.label}</Text>
              <X color={palette.muted} size={14} strokeWidth={2} />
            </Pressable>
          ),
        )}
        {items.map((label, index) => (
          <Pressable
            accessibilityLabel={t("form.removeSubtask", { label })}
            accessibilityRole="button"
            className="h-8 flex-row items-center gap-1 rounded-pill border-2 border-line bg-surface pl-3 pr-2 active:opacity-70"
            key={`${String(index)}-${label}`}
            onPress={() => {
              onChange(items.filter((_, other) => other !== index));
            }}
          >
            <Text className="font-sans text-[13px] text-fg">{label}</Text>
            <X color={palette.muted} size={14} strokeWidth={2} />
          </Pressable>
        ))}
        <TextInput
          accessibilityLabel={t("form.addSubtask")}
          className="h-8 min-w-32 rounded-pill border border-dashed border-line px-3 font-sans text-[13px] text-fg"
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={t("form.addSubtask")}
          placeholderTextColor={palette.muted}
          returnKeyType="done"
          submitBehavior="submit"
          value={draft}
        />
      </View>
    </View>
  );
};
