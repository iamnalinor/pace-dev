import { Switch, Text, View } from "react-native";

import { useTheme } from "./theme-provider.tsx";

/** A setting line with a hint under the label and a native switch on the right (lime when on). */
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
  const { palette } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="font-sans text-[14px] text-fg">{label}</Text>
        {hint === undefined ? null : (
          <Text className="font-sans text-[12px] text-muted">{hint}</Text>
        )}
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={isOn ? palette.accentFg : palette.fg2}
        trackColor={{ false: palette.raised, true: palette.accent }}
        value={isOn}
      />
    </View>
  );
};
