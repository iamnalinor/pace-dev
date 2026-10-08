import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import {
  byPresetOrder,
  EXAMPLE_PRESET_IDS,
  type Preset,
  presetById,
  presetLabel,
  resolvePreset,
} from "@pace/core";

import { ChoiceChips } from "./choice-chips.tsx";

const Badge = ({
  children,
  isQuiet = false,
}: {
  readonly children: string;
  readonly isQuiet?: boolean;
}) => (
  <Text
    className={cx(
      "rounded-sm px-1.5 py-0.5 font-sans text-[11px]",
      isQuiet ? "text-muted" : "bg-raised text-fg2",
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
  const { palette } = useTheme();
  const { actions } = usePace();
  const run = useRunAction();
  const presets = useAppState((state) => state.presets);
  const resolved = resolvePreset(presets, preset.id);
  const name = presetLabel(preset, language);
  return (
    <View className="min-h-14 flex-row items-center gap-1 border-b border-line">
      <Pressable
        accessibilityRole="link"
        className="min-h-14 flex-1 flex-row items-center gap-2 px-1 active:opacity-70"
        onPress={() => {
          router.push({ params: { id: preset.id }, pathname: "/presets/[id]" });
        }}
      >
        <View className="min-w-0 flex-1 flex-row">
          <ColorTag color={resolved.ok ? resolved.value.color : null}>{name}</ColorTag>
        </View>
        {preset.archived ? <Badge isQuiet>{t("presets.archivedBadge")}</Badge> : null}
        <Badge>{t(preset.builtIn ? "presets.builtIn" : "presets.yours")}</Badge>
        <ChevronRight color={palette.faint} size={16} strokeWidth={1.75} />
      </Pressable>
      <IconButton
        disabled={isFirst}
        icon={ChevronUp}
        label={t("presets.moveUp", { name })}
        onPress={() => void run(actions.movePreset(preset.id, -1))}
        variant="plain"
      />
      <IconButton
        disabled={isLast}
        icon={ChevronDown}
        label={t("presets.moveDown", { name })}
        onPress={() => void run(actions.movePreset(preset.id, 1))}
        variant="plain"
      />
    </View>
  );
};

/** "Start from [Homework] [Work] …  New preset". */
const NewPreset = ({ choices }: { readonly choices: readonly Preset[] }) => {
  const t = useT();
  const language = useLanguage();
  const router = useRouter();
  const [from, setFrom] = useState("hw");
  return (
    <View className="gap-2 rounded-xl border border-line bg-surface p-3.5">
      <Text className="font-sans text-[12px] text-muted">{t("presets.startFrom")}</Text>
      <ChoiceChips
        label={t("presets.startFrom")}
        labelOf={(id) => {
          const preset = choices.find((choice) => choice.id === id);
          return preset === undefined ? id : presetLabel(preset, language);
        }}
        onChange={setFrom}
        value={from}
        values={choices.map((preset) => preset.id)}
      />
      <Button
        onPress={() => {
          router.push({ params: { from, id: "new" }, pathname: "/presets/[id]" });
        }}
      >
        {t("presets.new")}
      </Button>
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
