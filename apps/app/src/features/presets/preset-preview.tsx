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
      className="mx-4 mt-3 gap-2 rounded-xl border border-dashed border-line p-3"
      role="group"
    >
      <Text className="font-sans text-[11px] uppercase tabular-nums tracking-[0.06em] text-muted">
        {t("presets.preview")}
      </Text>
      <View className="flex-row gap-3">
        <View className="mt-px h-[22px] w-[22px] rounded-full border-[1.5px] border-muted" />
        <View className="min-w-0 flex-1 gap-[5px]">
          <Text
            className={cx(
              "font-sans text-[15px] text-fg",
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
