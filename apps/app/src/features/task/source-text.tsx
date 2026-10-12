import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

/** The text the task came from, shown verbatim on request. */
export const SourceText = ({ text }: { readonly text: null | string }) => {
  const t = useT();
  const { palette } = useTheme();
  const [isShown, setIsShown] = useState(false);
  if (text === null) {
    return null;
  }
  return (
    <View className="mx-4 gap-2">
      <Pressable
        accessibilityRole="button"
        aria-expanded={isShown}
        className="min-h-11 flex-row items-center gap-1.5"
        onPress={() => {
          setIsShown((shown) => !shown);
        }}
      >
        <Text className="font-sans text-[13px] text-fg2">{t("task.source")}</Text>
        {isShown ? (
          <ChevronUp color={palette.muted} size={16} strokeWidth={2} />
        ) : (
          <ChevronDown color={palette.muted} size={16} strokeWidth={2} />
        )}
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
