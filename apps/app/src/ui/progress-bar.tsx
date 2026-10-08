import { View } from "react-native";

const PERCENT = 100;

const share = (fraction: number): `${number}%` =>
  `${Math.min(Math.max(fraction, 0), 1) * PERCENT}%`;

/** The 3px bar of a task row: progress in the foreground colour, the pace marker in lime. */
export const ProgressBar = ({
  label,
  marker,
  value,
}: {
  readonly label: string;
  /** Where pace says the task should be by now (0..1); hidden when `null`. */
  readonly marker: null | number;
  readonly value: number;
}) => (
  <View
    accessibilityLabel={label}
    accessibilityRole="progressbar"
    aria-valuemax={PERCENT}
    aria-valuemin={0}
    aria-valuenow={Math.round(value * PERCENT)}
    className="h-[3px] rounded-sm bg-track"
  >
    <View className="h-[3px] rounded-sm bg-fg" style={{ width: share(value) }} />
    {marker === null ? null : (
      <View
        className="absolute -top-[3px] h-[9px] w-0.5 rounded-[1px] bg-accentText"
        style={{ left: share(marker) }}
      />
    )}
  </View>
);
