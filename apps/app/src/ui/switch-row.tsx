import { Pressable, Switch, Text, View } from "react-native";

import { SWITCH_REACH_PX, SWITCH_STYLE } from "./switch-size.ts";
import { useTheme } from "./theme-provider.tsx";

/** The native switch in Pace's colours: off, a cell knob on the outline track; on, on the accent. */
export const PaceSwitch = ({
  isOn,
  label,
  onChange,
}: {
  readonly isOn: boolean;
  readonly label: string;
  readonly onChange: (isOn: boolean) => void;
}) => {
  const { palette } = useTheme();
  // react-native-web colors the knob of an "on" switch with its own teal unless told otherwise.
  const webKnob = { activeThumbColor: palette["accent.on"] };
  return (
    <View>
      {SWITCH_REACH_PX === null ? null : (
        // Behind the switch and reaching past it: a press just above or below it flips the
        // switch too, while a press on the switch reaches the switch itself (drawn after, so on
        // top). The switch stays the control for the keyboard and screen readers.
        <Pressable
          aria-hidden
          className="absolute left-0 right-0"
          onPress={() => {
            onChange(!isOn);
          }}
          style={{ bottom: -SWITCH_REACH_PX, top: -SWITCH_REACH_PX }}
          tabIndex={-1}
          testID="switch-reach"
        />
      )}
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        style={SWITCH_STYLE}
        thumbColor={isOn ? palette["accent.on"] : palette["bg.cell"]}
        trackColor={{ false: palette.outline, true: palette.accent }}
        value={isOn}
        {...webKnob}
      />
    </View>
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
