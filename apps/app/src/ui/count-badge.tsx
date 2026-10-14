import { Text, View } from "react-native";

/**
A small pill with a number, for what waits (the Inbox). It is neutral, in the quiet accent: lime
is for the actions. Hidden at zero; the host names the count in its own accessibility label.
*/
export const CountBadge = ({ count }: { readonly count: number }) =>
  count <= 0 ? null : (
    <View
      className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accentQuiet px-1.5"
      testID="count-badge"
    >
      <Text className="font-sans text-[11px] font-medium tabular-nums text-accentQuietFg">
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
