import { Pressable, Text, View } from "react-native";

import { cx } from "./cx.ts";
import { spacePress } from "./space-press.ts";

/**
The switch, drawn by the kit on both platforms (spec §4.2.26), in a 48 target (the layout box is the
32 track: the Chip's negative margin); Space presses it on the web too. The knob sits inside the track, so it
never meets the page behind the switch: the native one is wider than its track, and a dark knob
vanished into the dark page. On: the accent track with the on-accent knob. Off: the `outline` ring
on the `fill.2` track with a `label.tertiary` knob (the spec's `outline` knob measures 2.7:1 on it).
*/
export const PaceSwitch = ({
  isOn,
  label,
  onChange,
}: {
  readonly isOn: boolean;
  readonly label: string;
  readonly onChange: (isOn: boolean) => void;
}) => {
  const toggle = (): void => {
    onChange(!isOn);
  };
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOn }}
      aria-checked={isOn}
      className="-my-2 h-hit shrink-0 justify-center rounded-pill"
      onPress={toggle}
      {...spacePress(toggle)}
    >
      <View
        className={cx(
          "h-switch-h w-switch-w flex-row items-center rounded-pill border-2 pl-1",
          isOn ? "border-accent bg-accent" : "border-outline bg-fill-2",
        )}
        testID="switch-track"
      >
        <View
          className={cx(
            "rounded-pill",
            isOn
              ? "ml-auto mr-0.5 size-switch-knob-on bg-accent-on"
              : "ml-0.5 size-switch-knob-off bg-label-tertiary",
          )}
          testID="switch-knob"
        />
      </View>
    </Pressable>
  );
};

/** A setting line with a hint under the label and the switch on the right. */
export const SwitchRow = ({
  hint,
  label,
  onChange,
  isOn,
}: {
  readonly hint?: string;
  readonly label: string;
  readonly onChange: (isOn: boolean) => void;
  readonly isOn: boolean;
}) => {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="font-sans text-subhead font-normal text-label-primary">{label}</Text>
        {hint === undefined ? null : (
          <Text className="font-sans text-caption font-normal text-label-tertiary">{hint}</Text>
        )}
      </View>
      <PaceSwitch isOn={isOn} label={label} onChange={onChange} />
    </View>
  );
};
