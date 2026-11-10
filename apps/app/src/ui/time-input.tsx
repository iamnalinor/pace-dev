import { type Ref, useId, useState } from "react";
import { TextInput, View } from "react-native";

import { typeTime } from "@pace/client";

import { useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { boxClass, ErrorMessage, FocusRing } from "./text-field.tsx";
import { useTheme } from "./theme-provider.tsx";

/**
How long a typed time may get: room for a paste the parser reads whole («9:30 PM», «12:345» are
refused as typed rather than cut to a wrong time by the browser).
*/
export const TIME_MAX_LENGTH = 8;

/**
An `HH:MM` field typed as digits (the colon comes by itself; spec §4.2.29, the time purpose of the
kit's field). The text stays local while it is typed; `onTime` hears the time when the person
leaves the field or presses Enter, read whole, and only when it is a time that differs from the
stored one: a stored time never holds "1" or "14:", and an edit in the middle of a filled value
(the hour deleted to retype it) never writes a wrong time on the way (QA-25 review I1). Left
with a text that is not a time, the field keeps it and says so under itself, as Day's sheet does
(R26-05). It wears the field's states (the focus ring on focus, the danger border, the disabled
look) on the same box as `TextField`, and is as wide as its content (F-LAY-09), unless the
caller sizes it.
*/
export const TimeInput = ({
  className,
  editable = true,
  label,
  onTime,
  ref,
  value,
}: {
  readonly className?: string;
  readonly editable?: boolean;
  readonly label: string;
  readonly onTime: (time: string) => void;
  readonly ref?: Ref<TextInput> | undefined;
  readonly value: string;
}) => {
  const { palette } = useTheme();
  const t = useT();
  const messageId = useId();
  const [text, setText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [isWrong, setIsWrong] = useState(false);
  // Only what the person typed is saved: a field left untouched shows the stored time again,
  // so a time changed elsewhere meanwhile is never written back over.
  const [isEdited, setIsEdited] = useState(false);
  const commit = (): void => {
    if (!isEdited) {
      setText(value);
      return;
    }
    const read = typeTime(text);
    if (!read.isComplete) {
      setIsWrong(true);
      return;
    }
    setIsWrong(false);
    setIsEdited(false);
    setText(read.text);
    if (read.text !== value) {
      onTime(read.text);
    }
  };
  return (
    <View className={cx("gap-2 self-start", className)}>
      <View className={boxClass({ isDisabled: !editable, isErrored: isWrong, multiline: false })}>
        {isFocused ? <FocusRing /> : null}
        <TextInput
          accessibilityLabel={label}
          aria-describedby={isWrong ? messageId : undefined}
          aria-invalid={isWrong}
          autoComplete="off"
          className={cx(
            "min-w-0 flex-1 py-2 font-sans text-body tabular-nums",
            editable ? "text-label-primary" : "text-label-quaternary",
          )}
          editable={editable}
          inputMode="numeric"
          maxLength={TIME_MAX_LENGTH}
          onBlur={() => {
            setIsFocused(false);
            commit();
          }}
          onChangeText={(raw) => {
            setIsEdited(true);
            setText(typeTime(raw, text).text);
          }}
          onFocus={() => {
            setIsFocused(true);
          }}
          onSubmitEditing={commit}
          placeholder="00:00"
          placeholderTextColor={palette["label.tertiary"]}
          ref={ref}
          value={text}
        />
      </View>
      {isWrong ? <ErrorMessage error={t("day.badTime")} id={messageId} /> : null}
    </View>
  );
};
