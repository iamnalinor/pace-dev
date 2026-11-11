import { useT } from "#app/app-state.tsx";
import { PresetsList } from "#app/features/presets/presets-list.tsx";
import { ListScreen } from "#app/screens/pushed-screen.tsx";
import { FirstSyncBody } from "#app/ui/empty-state.tsx";
import { Text } from "#app/ui/text.tsx";

export const PresetsScreen = () => {
  const t = useT();
  return (
    <ListScreen title={t("presets.title")}>
      <Text className="mx-gutter mb-2 px-row-x" role="callout" tone="secondary">
        {t("settings.presets.hint")}
      </Text>
      {/* The account's presets, and what may be added to them, wait for a sync of this session to
      succeed (QA 20 M1, round 7 review 12). */}
      <FirstSyncBody>
        <PresetsList />
      </FirstSyncBody>
    </ListScreen>
  );
};
