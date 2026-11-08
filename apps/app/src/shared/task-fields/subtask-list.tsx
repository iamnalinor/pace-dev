import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { entryFieldProps } from "#app/platform/enter-key.ts";
import { cx } from "#app/ui/cx.ts";
import { Icon } from "#app/ui/icon.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";

/** A subtask the task already has; a done one says so (taking it off is undone in History). */
export type KeptSubtask = { readonly id: string; readonly label: string; readonly isDone: boolean };

const NONE: readonly KeptSubtask[] = [];

/** The row's bullet: a small open circle, like an unticked box (filled once done). */
const Bullet = ({ isDone = false }: { readonly isDone?: boolean }) => (
  <View
    className={cx(
      "h-4 w-4 rounded-pill border-stroke border-outline",
      isDone && "bg-label-tertiary",
    )}
  />
);

/**
One subtask: the bullet, its text and a remove "×". With a mouse the × waits until the row is
pointed at (or the × has the keyboard's focus); on a touch screen it is always there.
*/
const Row = ({
  isDone = false,
  label,
  onRemove,
}: {
  readonly isDone?: boolean;
  readonly label: string;
  readonly onRemove?: (() => void) | undefined;
}) => {
  const t = useT();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isShowsRemove = KEYBOARD === null || isHovered || isFocused;
  return (
    <View
      className="min-h-10 flex-row items-center gap-3 pl-1"
      onPointerEnter={() => {
        setIsHovered(true);
      }}
      onPointerLeave={() => {
        setIsHovered(false);
      }}
      role="listitem"
    >
      <Bullet isDone={isDone} />
      <Text
        className={cx(
          "flex-1 font-sans text-subhead font-normal",
          isDone ? "text-label-secondary" : "text-label-primary",
        )}
      >
        {label}
      </Text>
      {isDone ? (
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {t("task.subtaskDoneLabel")}
        </Text>
      ) : null}
      {onRemove === undefined ? null : (
        <Pressable
          accessibilityLabel={t("form.removeSubtask", { label })}
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-md active:opacity-70"
          onBlur={() => {
            setIsFocused(false);
          }}
          onFocus={() => {
            setIsFocused(true);
          }}
          onPress={onRemove}
          style={{ opacity: isShowsRemove ? 1 : 0 }}
        >
          <Icon name="x" size="inline" />
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
const AddSubtask = ({
  draft,
  onAdd,
  onDraftChange,
}: {
  readonly draft: string;
  readonly onAdd: (label: string) => void;
  readonly onDraftChange: (draft: string) => void;
}) => {
  const t = useT();
  const [isOpenByPress, setIsOpenByPress] = useState(false);
  // A typed one keeps the field open (its text is part of the form's save).
  const isOpen = isOpenByPress || draft !== "";
  if (!isOpen) {
    return (
      <Pressable
        accessibilityLabel={t("form.addSubtask")}
        accessibilityRole="button"
        className="h-10 flex-row items-center gap-2 self-start rounded-md pr-2 active:opacity-70"
        onPress={() => {
          setIsOpenByPress(true);
        }}
      >
        <Icon name="plus" size="inline" />
        <Text className="font-sans text-subhead font-normal text-label-secondary">
          {t("form.addSubtask")}
        </Text>
      </Pressable>
    );
  }
  const close = (): void => {
    onDraftChange("");
    setIsOpenByPress(false);
  };
  return (
    <View className="min-h-10 flex-row items-center gap-3 pl-1">
      <Bullet />
      <View className="flex-1">
        <TextField
          {...entryFieldProps}
          autoFocus
          isLabelHidden
          label={t("form.addSubtask")}
          onBlur={() => {
            if (draft.trim() === "") {
              close();
            }
          }}
          onChangeText={onDraftChange}
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
            onDraftChange("");
          }}
          placeholder={t("form.addSubtask")}
          returnKeyType="next"
          value={draft}
        />
      </View>
    </View>
  );
};

/**
The new subtasks as a save takes them: a subtask still being typed (not yet added with Enter)
counts as the last one, so pressing Create or Save never drops it.
*/
export const withDraft = (items: readonly string[], draft: string): readonly string[] =>
  draft.trim() === "" ? items : [...items, draft.trim()];

/**
The subtasks, a plain list: those a task already has (kept; unsent ones can be taken off), the
new ones (each removable), and "+ Add a subtask" last. The composer's form and the task editor
both draw it; the text being typed is theirs (`draft`), so their save can keep it.
*/
export const SubtaskList = ({
  draft,
  items,
  kept = NONE,
  onChange,
  onDraftChange,
  onRemoveKept,
}: {
  readonly draft: string;
  readonly kept?: readonly KeptSubtask[] | undefined;
  readonly items: readonly string[];
  readonly onChange: (items: readonly string[]) => void;
  readonly onDraftChange: (draft: string) => void;
  readonly onRemoveKept?: (id: string) => void;
}) => {
  const t = useT();
  const isEmpty = kept.length === 0 && items.length === 0;
  return (
    <View className="gap-1">
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("form.subtasks")}
      </Text>
      {isEmpty ? null : (
        <View aria-label={t("form.subtasks")} role="list">
          {kept.map((subtask) => (
            <Row
              isDone={subtask.isDone}
              key={subtask.id}
              label={subtask.label}
              onRemove={
                onRemoveKept === undefined
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
        draft={draft}
        onAdd={(label) => {
          onChange([...items, label]);
        }}
        onDraftChange={onDraftChange}
      />
    </View>
  );
};
