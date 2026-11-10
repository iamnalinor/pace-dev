import { View } from "react-native";

import { cx } from "./cx.ts";
import { Pressable } from "./pressable.tsx";

/**
The switch as drawn (spec §4.2.26, Material 3 on both platforms; react-native-web's 20 px switch
and the native `thumbColor` are gone): a 52 × 32 pill track. On: the `accent` track with a 24 knob
in `accent.on`. Off: the `fill.2` track inside a 2 px `outline` ring with a 16 knob in
`label.tertiary` (an `outline` knob measures 2.7:1 on `fill.2`; F-COL-09, `USED_PAIRS`), 8 px from
the track's edge. Disabled: the `fill.1` track and a `label.quaternary` knob. The knob always sits
inside the track, so it never meets the page behind it (V2-01).
*/
export const SwitchTrack = ({
  disabled = false,
  isOn,
}: {
  readonly disabled?: boolean;
  readonly isOn: boolean;
}) => {
  const track = isOn ? "border-accent bg-accent" : "border-outline bg-fill-2";
  const knob = isOn
    ? "ml-auto mr-0.5 size-switch-knob-on bg-accent-on"
    : "ml-0.5 size-switch-knob-off bg-label-tertiary";
  return (
    <View
      className={cx(
        "h-switch-h w-switch-w shrink-0 flex-row items-center rounded-pill border-2 pl-1",
        disabled ? "border-fill-1 bg-fill-1" : track,
      )}
      testID="switch-track"
    >
      <View
        className={cx("rounded-pill", knob, disabled && "bg-label-quaternary")}
        testID="switch-knob"
      />
    </View>
  );
};

/**
A switch on its own (a matrix of channels, an override beside its value): the drawn track in the
48 dp / 44 px target of the kit's Pressable (the small-visual pattern: no negative margin); Space
presses it on the web. A setting with a label is a `ListRow toggle` instead, which flips from its
label too (R23-10).
*/
export const Switch = ({
  disabled = false,
  isOn,
  label,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly isOn: boolean;
  readonly label: string;
  readonly onChange: (isOn: boolean) => void;
}) => (
  <Pressable
    checked={isOn}
    disabled={disabled}
    label={label}
    onPress={() => {
      onChange(!isOn);
    }}
    role="switch"
    shape="pill"
    visual=""
  >
    <SwitchTrack disabled={disabled} isOn={isOn} />
  </Pressable>
);
