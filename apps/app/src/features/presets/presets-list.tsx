import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { Group } from "#app/ui/group.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { HueTile } from "#app/ui/tag.tsx";
import {
  byPresetOrder,
  EXAMPLE_PRESET_IDS,
  type Preset,
  presetById,
  presetLabel,
  resolvePreset,
} from "@pace/core";

/**
One preset: its tile and name, «Default» or «Yours» (and «Deleted») under the name, so the name
takes the row and the arrows beside it (which move it in the pickers) never cut it to «Домаш…»
(design review H3).
*/
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
  const kind = [
    ...(preset.archived ? [t("presets.archivedBadge")] : []),
    t(preset.builtIn ? "presets.builtIn" : "presets.yours"),
  ].join(" · ");
  return (
    <View className="flex-row items-center">
      <View className="min-w-0 flex-1">
        <ListRow
          // The label stands in for everything the row shows: the name and its kind (class 141).
          label={`${name}, ${kind}`}
          leading={<HueTile hue={resolved.ok ? resolved.value.color : "slate"} icon="repeat" />}
          onPress={() => {
            router.push({ params: { id: preset.id }, pathname: "/presets/[id]" });
          }}
          role="link"
          subtitle={kind}
          title={name}
          titleLines={1}
          trailing={<Icon name="chevron-right" size="inline" tone="tertiary" />}
        />
      </View>
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

/** Each kind opens a new unsaved preset based on it: actions that say so, none of them picked. */
const NewPreset = ({ choices }: { readonly choices: readonly Preset[] }) => {
  const t = useT();
  const language = useLanguage();
  const router = useRouter();
  return (
    <View accessibilityLabel={t("presets.new")} accessibilityRole="toolbar">
      <SectionHeader title={t("presets.new")} />
      <View className="mx-gutter flex-row flex-wrap gap-2 px-row-x">
        {choices.map((preset) => (
          <Chip
            isWhole
            key={preset.id}
            onPress={() => {
              router.push({ params: { from: preset.id, id: "new" }, pathname: "/presets/[id]" });
            }}
          >
            {t("presets.startFromName", { name: presetLabel(preset, language) })}
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
    <View className="pb-6">
      <Group aria-label={t("presets.title")} role="group">
        {shown.map((preset, index) => (
          <PresetRow
            isFirst={index === 0}
            isLast={index === shown.length - 1}
            key={preset.id}
            preset={preset}
          />
        ))}
      </Group>
      <NewPreset choices={all.filter((preset) => !preset.archived)} />
      {hasExamples ? null : (
        <View className="mx-gutter mt-4 items-start px-row-x">
          <Button onPress={() => void run(actions.seedExamplePresets())} variant="secondary">
            {t("presets.seedExamples")}
          </Button>
        </View>
      )}
      <View className="mt-4">
        <Group>
          <SwitchRow
            isOn={isShowingArchived}
            label={t("presets.showArchived")}
            onChange={setIsShowingArchived}
          />
        </Group>
      </View>
    </View>
  );
};
