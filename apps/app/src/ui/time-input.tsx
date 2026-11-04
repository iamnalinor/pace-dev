import { type Ref, useState } from "react";
import { TextInput, View } from "react-native";

import { typeTime } from "@pace/client";

import { cx } from "./cx.ts";
import { boxClass, FocusRing } from "./text-field.tsx";
import { useTheme } from "./theme-provider.tsx";

/**
An `HH:MM` field typed as digits (the colon comes by itself; spec §4.2.29, the time purpose of the
kit's field). The text stays local while it is half typed; `onTime` hears only complete times, so
a stored time never holds "1" or "14:". It wears the field's states (the focus ring on focus, the
disabled look) on the same box as `TextField`, and is as wide as its content (F-LAY-09: it was a
full-width 788 px box), unless the caller sizes it.
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
  const [text, setText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  return (
    <View
      className={cx(
        boxClass({ isDisabled: !editable, isErrored: false, multiline: false }),
        "self-start",
        className,
      )}
    >
      {isFocused ? <FocusRing /> : null}
      <TextInput
        accessibilityLabel={label}
        autoComplete="off"
        className={cx(
          "min-w-0 flex-1 py-2 font-sans text-body tabular-nums",
          editable ? "text-label-primary" : "text-label-quaternary",
        )}
        editable={editable}
        inputMode="numeric"
        maxLength={5}
        onBlur={() => {
          setIsFocused(false);
          setText(value);
        }}
        onChangeText={(raw) => {
          const typed = typeTime(raw);
          setText(typed.text);
          if (typed.isComplete) {
            onTime(typed.text);
          }
        }}
        onFocus={() => {
          setIsFocused(true);
        }}
        placeholder="00:00"
        placeholderTextColor={palette["label.tertiary"]}
        ref={ref}
        value={text}
      />
    </View>
  );
};
