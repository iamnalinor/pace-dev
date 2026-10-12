import { type Ref, useState } from "react";
import { TextInput } from "react-native";

import { typeTime } from "@pace/client";

import { cx } from "./cx.ts";
import { useTheme } from "./theme-provider.tsx";

/**
An `HH:MM` field typed as digits (the colon comes by itself). The text stays local while it is
half typed; `onTime` hears only complete times, so a stored time never holds "1" or "14:".
*/
export const TimeInput = ({
  className,
  label,
  onTime,
  ref,
  value,
}: {
  readonly className?: string;
  readonly label: string;
  readonly onTime: (time: string) => void;
  readonly ref?: Ref<TextInput> | undefined;
  readonly value: string;
}) => {
  const { palette } = useTheme();
  const [text, setText] = useState(value);
  return (
    <TextInput
      accessibilityLabel={label}
      className={cx(
        "h-11 rounded-lg border border-line bg-bg px-3 font-sans text-[15px] tabular-nums text-fg",
        className,
      )}
      inputMode="numeric"
      maxLength={5}
      onBlur={() => {
        setText(value);
      }}
      onChangeText={(raw) => {
        const typed = typeTime(raw);
        setText(typed.text);
        if (typed.isComplete) {
          onTime(typed.text);
        }
      }}
      placeholder="00:00"
      placeholderTextColor={palette.faint}
      ref={ref}
      value={text}
    />
  );
};
