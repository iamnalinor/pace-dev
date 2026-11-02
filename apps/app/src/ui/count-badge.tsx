import { Text, View } from "react-native";

import { useLanguage } from "#app/app-state.tsx";
import { formatCount } from "@pace/core";

/**
A small pill with a number, for what waits (the Inbox), on the quiet accent: the filled accent is
for the actions. Hidden at zero; the host names the count in its own accessibility label.
*/
export const CountBadge = ({ count }: { readonly count: number }) => {
  const language = useLanguage();
  return count <= 0 ? null : (
    <View
      className="h-5 min-w-5 items-center justify-center rounded-pill bg-accent-quiet px-2"
      testID="count-badge"
    >
      <Text className="font-sans text-caption2 font-medium tabular-nums text-accent-text">
        {count > 99 ? "99+" : formatCount(count, language)}
      </Text>
    </View>
  );
};
