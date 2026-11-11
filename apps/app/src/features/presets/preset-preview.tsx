import { Text, View } from "react-native";

import { useAppState, usePace, useSettings, useT } from "#app/app-state.tsx";
import { MetaLine } from "#app/shared/meta-line.tsx";
import { ProgressBar } from "#app/ui/progress-bar.tsx";
import { Text as KitText } from "#app/ui/text.tsx";
import { type PresetDraft, presetPreview, PREVIEW_SAMPLE } from "@pace/client";

/** A sample task of this preset drawn like a Now row: its color, importance, due and progress. */
export const PresetPreview = ({ draft }: { readonly draft: PresetDraft }) => {
  const t = useT();
  const { hooks } = usePace();
  const presets = useAppState((state) => state.presets);
  const { timezone } = useSettings();
  const ctx = hooks.useClock();
  const preview = presetPreview(presets, draft, { ...ctx, zone: timezone ?? ctx.deviceTz });
  if (preview === null) {
    return null;
  }
  // The sample is a task of this preset: «Sample task», tagged with the preset's name (R25-14:
  // «Курсовая 2 1» read as a broken title, and the name stood twice).
  const name = draft.name.trim();
  return (
    <View
      accessibilityLabel={t("presets.preview")}
      className="mx-4 mt-3 gap-2 rounded-xl border border-dashed border-separator p-3"
      role="group"
    >
      <Text className="font-sans text-caption2 font-normal uppercase tabular-nums text-label-tertiary">
        {t("presets.preview")}
      </Text>
      <View className="flex-row gap-3">
        <View className="mt-0.5 h-6 w-6 rounded-pill border-stroke border-outline" />
        <View className="min-w-0 flex-1 gap-1">
          <KitText
            className={preview.importance === "nice_to_have" ? "font-normal" : "font-medium"}
            policy="truncate"
            role="callout"
          >
            {t("presets.sampleTitle")}
          </KitText>
          <MetaLine
            parts={preview.meta}
            tag={name === "" ? null : { color: preview.color, tag: { kind: "project", name } }}
          />
          {preview.progressMode === "none" ? null : (
            <ProgressBar label={t("presets.preview")} value={PREVIEW_SAMPLE.progress} />
          )}
        </View>
      </View>
    </View>
  );
};
