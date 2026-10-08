import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useTheme } from "./theme-provider.tsx";

/** The chevron mark from `assets/logo/pace-mark.svg`, drawn with the current palette. */
export const PaceMark = ({ size = 56 }: { readonly size?: number }) => {
  const { palette } = useTheme();
  return (
    <Svg height={size} viewBox="0 0 120 120" width={size}>
      <Path
        d="M18 30 L48 60 L18 90"
        fill="none"
        stroke={palette.faint}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={16}
      />
      <Path
        d="M58 30 L88 60 L58 90"
        fill="none"
        stroke={palette.accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={16}
      />
      <Circle cx={106} cy={60} fill={palette.fg} r={8} />
    </Svg>
  );
};

/** Mark + wordmark, as on the login card; the wordmark is the page heading, `heading` its name. */
export const PaceLogo = ({
  heading,
  wordmark,
}: {
  readonly heading: string;
  readonly wordmark: string;
}) => (
  <View className="items-center gap-4">
    <PaceMark />
    <Text
      accessibilityLabel={heading}
      accessibilityRole="header"
      className="font-sans text-[34px] font-semibold tracking-tight text-fg"
    >
      {wordmark}
    </Text>
  </View>
);
