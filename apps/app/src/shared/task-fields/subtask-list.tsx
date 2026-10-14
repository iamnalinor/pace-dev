import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { entryFieldProps } from "#app/platform/enter-key.ts";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";

/** A subtask the task already has; a sent one is on the record and cannot be taken off. */
export type KeptSubtask = { readonly id: string; readonly label: string; readonly isSent: boolean };

const NONE: readonly KeptSubtask[] = [];

/** The row's bullet: a small open circle, like an unticked box (filled once sent). */
const Bullet = ({ isSent = false }: { readonly isSent?: boolean }) => (
  <View
    className={cx("h-3.5 w-3.5 rounded-full border-[1.5px] border-muted", isSent && "bg-muted")}
  />
);

/**
One subtask: the bullet, its text and a remove "×". With a mouse the × waits until the row is
pointed at (or the × has the keyboard's focus); on a touch screen it is always there.
*/
const Row = ({
  isSent = false,
  label,
  onRemove,
}: {
  readonly isSent?: boolean;
  readonly label: string;
  readonly onRemove?: (() => void) | undefined;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isShowsRemove = KEYBOARD === null || isHovered || isFocused;
  return (
    <View
      className="min-h-9 flex-row items-center gap-2.5 pl-1"
      onPointerEnter={() => {
        setIsHovered(true);
      }}
      onPointerLeave={() => {
        setIsHovered(false);
      }}
      role="listitem"
    >
      <Bullet isSent={isSent} />
      <Text className={cx("flex-1 font-sans text-[14px]", isSent ? "text-muted" : "text-fg")}>
        {label}
      </Text>
      {isSent ? (
        <Text className="font-sans text-[12px] text-muted">{t("task.subtaskSentLabel")}</Text>
      ) : null}
      {onRemove === undefined ? null : (
        <Pressable
          accessibilityLabel={t("form.removeSubtask", { label })}
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-md active:opacity-70"
          onBlur={() => {
            setIsFocused(false);
          }}
          onFocus={() => {
            setIsFocused(true);
          }}
          onPress={onRemove}
          style={{ opacity: isShowsRemove ? 1 : 0 }}
        >
          <X color={palette.muted} size={16} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
};

/**
The list's last row: "+ Add a subtask", which turns into a field. Enter adds what is typed and
keeps the field for the next one; Escape, or leaving it empty, closes it (a typed one stays put
when the field is left, to come back to).
*/
const AddSubtask = ({ onAdd }: { readonly onAdd: (label: string) => void }) => {
  const t = useT();
  const { palette } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!isOpen) {
    return (
      <Pressable
        accessibilityLabel={t("form.addSubtask")}
        accessibilityRole="button"
        className="h-9 flex-row items-center gap-2 self-start rounded-md pr-2 active:opacity-70"
        onPress={() => {
          setIsOpen(true);
        }}
      >
        <Plus color={palette.muted} size={16} strokeWidth={2} />
        <Text className="font-sans text-[14px] text-muted">{t("form.addSubtask")}</Text>
      </Pressable>
    );
  }
  const close = (): void => {
    setDraft("");
    setIsOpen(false);
  };
  return (
    <View className="min-h-9 flex-row items-center gap-2.5 pl-1">
      <Bullet />
      <TextInput
        {...entryFieldProps}
        accessibilityLabel={t("form.addSubtask")}
        autoFocus
        className="h-9 flex-1 font-sans text-[14px] text-fg"
        onBlur={() => {
          if (draft.trim() === "") {
            close();
          }
        }}
        onChangeText={setDraft}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") {
            close();
          }
        }}
        onSubmitEditing={() => {
          const label = draft.trim();
          if (label === "") {
            close();
            return;
          }
          onAdd(label);
          setDraft("");
        }}
        placeholder={t("form.addSubtask")}
        placeholderTextColor={palette.muted}
        returnKeyType="next"
        value={draft}
      />
    </View>
  );
};

/**
The subtasks, a plain list: those a task already has (kept; unsent ones can be taken off), the
new ones (each removable), and "+ Add a subtask" last. The composer's form and the task editor
both draw it.
*/
export const SubtaskList = ({
  items,
  kept = NONE,
  onChange,
  onRemoveKept,
}: {
  readonly kept?: readonly KeptSubtask[] | undefined;
  readonly items: readonly string[];
  readonly onChange: (items: readonly string[]) => void;
  readonly onRemoveKept?: (id: string) => void;
}) => {
  const t = useT();
  const isEmpty = kept.length === 0 && items.length === 0;
  return (
    <View className="gap-1">
      <Text className="font-sans text-[12px] text-muted">{t("form.subtasks")}</Text>
      {isEmpty ? null : (
        <View aria-label={t("form.subtasks")} role="list">
          {kept.map((subtask) => (
            <Row
              isSent={subtask.isSent}
              key={subtask.id}
              label={subtask.label}
              onRemove={
                onRemoveKept === undefined || subtask.isSent
                  ? undefined
                  : () => {
                      onRemoveKept(subtask.id);
                    }
              }
            />
          ))}
          {items.map((label, index) => (
            <Row
              key={`${String(index)}-${label}`}
              label={label}
              onRemove={() => {
                onChange(items.filter((_, other) => other !== index));
              }}
            />
          ))}
        </View>
      )}
      <AddSubtask
        onAdd={(label) => {
          onChange([...items, label]);
        }}
      />
    </View>
  );
};
