import { cx } from "./cx.ts";
import { Pressable } from "./pressable.tsx";
import { RadioGroup, useRadio } from "./radio-group.tsx";
import { Text } from "./text.tsx";

export type SegmentedOption<T extends string> = { readonly label: string; readonly value: T };

const toneOf = (isDisabled: boolean, isChosen: boolean): "primary" | "quaternary" | "secondary" => {
  if (isDisabled) {
    return "quaternary";
  }
  return isChosen ? "primary" : "secondary";
};

const Segment = ({
  disabled,
  label,
  value,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly value: string;
}) => {
  const { checked, onPress, setNode, tabIndex } = useRadio(value);
  return (
    <Pressable
      checked={checked}
      className="flex-1"
      disabled={disabled}
      onPress={onPress}
      ref={setNode}
      role="radio"
      shape="pill"
      tabIndex={tabIndex}
      visual={cx(
        "m-1 flex-1 items-center justify-center self-stretch px-3",
        // The thumb alone is 1.1:1 on the track: a `label.tertiary` edge carries it (bug-lessons 123).
        checked && "border border-label-tertiary bg-elevated",
      )}
    >
      <Text
        className={checked ? "font-semibold" : ""}
        role="subhead"
        tone={toneOf(disabled, checked)}
      >
        {label}
      </Text>
    </Pressable>
  );
};

/**
A real segmented control for two to four choices (Theme, Language, a channel; spec §4.2.19): a
`fill.2` pill track with equal segments, the chosen one a raised thumb (`bg.elevated` inside a
`label.tertiary` hairline, the edge that stands out 3:1) with its label in `label.primary` 600, so
shape and weight mark it, not colour. A radio group: one tab
stop, the arrows move the choice. Labels wrap rather than ellipsize (RU at 320).
*/
export const Segmented = <T extends string>({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  readonly disabled?: boolean;
  /** The group's accessible name. */
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
}) => (
  <RadioGroup
    className="flex-row rounded-pill bg-fill-2"
    label={label}
    onChange={(next: T) => {
      onChange(next);
    }}
    value={value}
    values={options.map((option) => option.value)}
  >
    {options.map((option) => (
      <Segment disabled={disabled} key={option.value} label={option.label} value={option.value} />
    ))}
  </RadioGroup>
);
