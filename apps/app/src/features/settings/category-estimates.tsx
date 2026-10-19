import { useState } from "react";
import { Text, View } from "react-native";

import { usePace, useSettings, useT } from "#app/app-state.tsx";
import { EstimateChip, EstimateOptions } from "#app/shared/task-fields/estimate-field.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { ACTIVITY_CATEGORIES, type ActivityCategory, CATEGORY_EXPECT } from "@pace/core";

/** Manual per-category Expect, used after an activity's own estimate and before history. */
export const CategoryEstimates = () => {
  const t = useT();
  const { actions } = usePace();
  const { categoryEstimates } = useSettings();
  const run = useRunAction();
  const [opened, setOpened] = useState<ActivityCategory | null>(null);
  return (
    <View className="gap-3">
      <Text className="font-sans text-[12px] leading-5 text-muted">
        {t("settings.categoryEstimates.hint")}
      </Text>
      {ACTIVITY_CATEGORIES.map((category) => (
        <View className="gap-2 border-t border-line pt-2" key={category}>
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="font-sans text-[13px] text-fg">{t(`category.${category}`)}</Text>
            <EstimateChip
              fallback={CATEGORY_EXPECT[category]}
              isOpen={opened === category}
              minutes={categoryEstimates[category] ?? null}
              onToggle={() => {
                setOpened(opened === category ? null : category);
              }}
            />
          </View>
          {opened === category ? (
            <EstimateOptions
              fallback={CATEGORY_EXPECT[category]}
              minutes={categoryEstimates[category] ?? null}
              onEstimate={(minutes) => {
                void (async () => {
                  if (await run(actions.setCategoryEstimate(category, minutes))) {
                    setOpened(null);
                  }
                })();
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
};
