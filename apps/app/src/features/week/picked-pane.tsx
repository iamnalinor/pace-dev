import { ScrollView, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Text } from "#app/ui/text.tsx";

import { PickedFacts, type PickedProps, useHeading } from "./picked-details.tsx";

/**
A wide window's details beside the grid, in the shell's inspector: it is there only while
something is picked (F-LAY-03).
*/
export const PickedPane = ({ onClose, onPick, picked, week }: PickedProps) => {
  const t = useT();
  const { title, when } = useHeading(picked, week.zone);
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 pb-10 pt-6">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text level={2} role="title2">
            {title}
          </Text>
          <Text className="mt-1" role="footnote" tone="secondary">
            {when}
          </Text>
        </View>
        {/* The cross's middle on the title's first line, as in the sheets (QA round 16 L10). */}
        <View className="-mr-2 h-6 justify-center">
          <IconButton icon={"x"} label={t("common.close")} onPress={onClose} />
        </View>
      </View>
      <PickedFacts onLeave={onClose} onPick={onPick} picked={picked} week={week} />
    </ScrollView>
  );
};
