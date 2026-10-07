import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";

/** The text the task came from, shown verbatim on request. */
export const SourceText = ({ text }: { readonly text: null | string }) => {
  const t = useT();
  const [isShown, setIsShown] = useState(false);
  if (text === null) {
    return null;
  }
  return (
    <View className="mx-4 gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isShown }}
        className="min-h-11 justify-center"
        onPress={() => {
          setIsShown((shown) => !shown);
        }}
      >
        <Text className="font-sans text-[13px] text-fg2">
          {t(isShown ? "task.hideSource" : "task.showSource")}
        </Text>
      </Pressable>
      {isShown ? (
        <Text
          className="rounded-lg bg-surface p-3 font-sans text-[14px] leading-5 text-fg"
          selectable
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
};
