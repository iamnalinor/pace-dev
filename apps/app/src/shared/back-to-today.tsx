import { Pressable, Text } from "react-native";

import { useT } from "#app/app-state.tsx";

/**
"Back to today", a quiet text button beside the ‹ › arrows of Day and Week. It is there
only away from today (or this week): on the present it would have nothing to do. It sits before
the arrows, so on a wide window, where they keep to the right edge, they never move.
*/
export const BackToToday = ({
  isAway,
  onPress,
}: {
  readonly isAway: boolean;
  readonly onPress: () => void;
}) => {
  const t = useT();
  if (!isAway) {
    return null;
  }
  return (
    <Pressable
      accessibilityRole="button"
      className="h-hit-web justify-center rounded-md px-2 active:opacity-70"
      onPress={onPress}
    >
      <Text className="font-sans text-footnote font-medium text-accent-text">
        {t("common.backToToday")}
      </Text>
    </Pressable>
  );
};
