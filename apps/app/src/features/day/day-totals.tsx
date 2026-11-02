import { Text, View } from "react-native";

import type { DayModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ColorTag } from "#app/ui/color.tsx";
import { formatDuration } from "@pace/core";

/** The day's tracked time and its split by category. */
export const Totals = ({ day }: { readonly day: DayModel }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap items-center gap-2 px-5 pb-3">
      <Text className="mr-1 font-sans text-subhead font-normal text-label-primary">
        {t("day.tracked", { duration: formatDuration(day.trackedMinutes, language) })}
      </Text>
      {day.totals.map((total) => (
        <ColorTag color={total.color} key={total.category}>
          {t("day.total", {
            category: t(`category.${total.category}`),
            duration: formatDuration(total.minutes, language),
          })}
        </ColorTag>
      ))}
    </View>
  );
};
