import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { Tag } from "#app/ui/tag.tsx";
import {
  byPresetOrder,
  EXAMPLE_PRESET_IDS,
  type Preset,
  presetById,
  presetLabel,
  resolvePreset,
} from "@pace/core";

const Badge = ({
  children,
  isQuiet = false,
}: {
  readonly children: string;
  readonly isQuiet?: boolean;
}) => (
  <Text
    className={cx(
      "rounded-sm px-2 py-0.5 font-sans text-caption2 font-normal",
      isQuiet ? "text-label-tertiary" : "bg-fill-3 text-label-secondary",
    )}
  >
    {children}
  </Text>
);

/** One preset: tap to edit, arrows to move it in the pickers. */
const PresetRow = ({
  isFirst,
  isLast,
  preset,
}: {
  readonly preset: Preset;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}) => {
  const t = useT();
  const language = useLanguage();
  const router = useRouter();
  const { actions } = usePace();
  const run = useRunAction();
  const presets = useAppState((state) => state.presets);
  const resolved = resolvePreset(presets, preset.id);
  const name = presetLabel(preset, language);
  return (
    <View className="min-h-row flex-row items-center gap-1 border-b border-separator">
      <Pressable
        accessibilityRole="link"
        className="min-h-row flex-1 flex-row items-center gap-2 px-1 active:opacity-70"
        onPress={() => {
          router.push({ params: { id: preset.id }, pathname: "/presets/[id]" });
        }}
      >
        <View className="min-w-0 flex-1 flex-row">
          <Tag hue={resolved.ok ? resolved.value.color : null}>{name}</Tag>
        </View>
        {preset.archived ? <Badge isQuiet>{t("presets.archivedBadge")}</Badge> : null}
        <Badge>{t(preset.builtIn ? "presets.builtIn" : "presets.yours")}</Badge>
        <Icon name="chevron-right" size="inline" tone="tertiary" />
      </Pressable>
      <IconButton
        disabled={isFirst}
        icon={"chevron-up"}
        label={t("presets.moveUp", { name })}
        onPress={() => void run(actions.movePreset(preset.id, -1))}
      />
      <IconButton
        disabled={isLast}
        icon={"chevron-down"}
        label={t("presets.moveDown", { name })}
        onPress={() => void run(actions.movePreset(preset.id, 1))}
      />
    </View>
  );
};

/** Each kind opens a new unsaved preset based on it: actions in a row, none of them picked. */
const NewPreset = ({ choices }: { readonly choices: readonly Preset[] }) => {
  const t = useT();
  const language = useLanguage();
  const router = useRouter();
  return (
    <View
      accessibilityLabel={t("presets.startFrom")}
      accessibilityRole="toolbar"
      className="gap-2 rounded-xl border border-separator bg-cell p-4"
    >
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("presets.startFrom")}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {choices.map((preset) => (
          <Chip
            key={preset.id}
            onPress={() => {
              router.push({ params: { from: preset.id, id: "new" }, pathname: "/presets/[id]" });
            }}
          >
            {presetLabel(preset, language)}
          </Chip>
        ))}
      </View>
    </View>
  );
};

/** Settings → Presets: defaults and own presets in picker order, new from any, the example seed. */
export const PresetsList = () => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const presets = useAppState((state) => state.presets);
  const [isShowingArchived, setIsShowingArchived] = useState(false);
  const all = Object.values(presets.byId)
    .filter((preset) => preset.id !== "inbox")
    .toSorted(byPresetOrder);
  const shown = all.filter((preset) => isShowingArchived || !preset.archived);
  const hasExamples = EXAMPLE_PRESET_IDS.some((id) => presetById(presets, id) !== undefined);
  return (
    <View className="gap-4 px-4 pb-6">
      <NewPreset choices={all.filter((preset) => !preset.archived)} />
      {hasExamples ? null : (
        <Button onPress={() => void run(actions.seedExamplePresets())} variant="secondary">
          {t("presets.seedExamples")}
        </Button>
      )}
      <SwitchRow
        isOn={isShowingArchived}
        label={t("presets.showArchived")}
        onChange={setIsShowingArchived}
      />
      <View accessibilityLabel={t("presets.title")} role="group">
        {shown.map((preset, index) => (
          <PresetRow
            isFirst={index === 0}
            isLast={index === shown.length - 1}
            key={preset.id}
            preset={preset}
          />
        ))}
      </View>
    </View>
  );
};
