import { Text, View } from "react-native";

import { useAppState, usePace, useSettings, useT } from "#app/app-state.tsx";
import { MetaLine } from "#app/shared/meta-line.tsx";
import { cx } from "#app/ui/cx.ts";
import { ProgressBar } from "#app/ui/progress-bar.tsx";
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
  const name = draft.name.trim() === "" ? t("presets.sampleTitle") : draft.name;
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
          <Text
            className={cx(
              "font-sans text-callout text-label-primary",
              preview.importance === "nice_to_have" ? "font-normal" : "font-medium",
            )}
            numberOfLines={1}
          >
            {draft.name.trim() === "" ? name : `${draft.name} 1`}
          </Text>
          <MetaLine
            parts={preview.meta}
            tag={{ color: preview.color, tag: { kind: "project", name } }}
          />
          {preview.progressMode === "none" ? null : (
            <ProgressBar
              label={t("presets.preview")}
              marker={null}
              value={PREVIEW_SAMPLE.progress}
            />
          )}
        </View>
      </View>
    </View>
  );
};
