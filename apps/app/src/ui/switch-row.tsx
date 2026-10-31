import { Switch, Text, View } from "react-native";

import { SWITCH_STYLE } from "./switch-size.ts";
import { useTheme } from "./theme-provider.tsx";

/** The native switch in Pace's colors: off, a light knob on a grey track; on, a white knob on the quiet indigo accent. */
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
  const webKnob = { activeThumbColor: palette.accentQuietFg };
  return (
    <Switch
      accessibilityLabel={label}
      onValueChange={onChange}
      style={SWITCH_STYLE}
      thumbColor={isOn ? palette.accentQuietFg : palette.surface}
      trackColor={{ false: palette.muted, true: palette.accentQuiet }}
      value={isOn}
      {...webKnob}
    />
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
        <Text className="font-sans text-[14px] text-fg">{label}</Text>
        {hint === undefined ? null : (
          <Text className="font-sans text-[12px] text-muted">{hint}</Text>
        )}
      </View>
      <PaceSwitch isOn={isOn} label={label} onChange={onChange} />
    </View>
  );
};
