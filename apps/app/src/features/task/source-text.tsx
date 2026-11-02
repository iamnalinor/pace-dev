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
        className="min-h-hit-web flex-row items-center gap-2"
        onPress={() => {
          setIsShown((shown) => !shown);
        }}
      >
        <Text className="font-sans text-footnote text-label-secondary">{t("task.source")}</Text>
        {isShown ? (
          <ChevronUp color={palette["label.secondary"]} size={16} strokeWidth={2} />
        ) : (
          <ChevronDown color={palette["label.secondary"]} size={16} strokeWidth={2} />
        )}
      </Pressable>
      {isShown ? (
        <Text
          className="rounded-lg bg-cell p-3 font-sans text-subhead font-normal text-label-primary"
          selectable
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
};
