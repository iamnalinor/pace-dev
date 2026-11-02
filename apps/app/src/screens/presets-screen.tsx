import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { PresetsList } from "#app/features/presets/presets-list.tsx";
import { FirstSyncBody } from "#app/ui/empty-state.tsx";

import { PushedScreen } from "./pushed-screen.tsx";

export const PresetsScreen = () => {
  const t = useT();
  return (
    <PushedScreen title={t("presets.title")}>
      <Text className="mx-5 mb-3 font-sans text-[12px] text-muted">
        {t("settings.presets.hint")}
      </Text>
      {/* The account's presets, and what may be added to them, wait for its first sync (QA 20 M1). */}
      <FirstSyncBody>
        <PresetsList />
      </FirstSyncBody>
    </PushedScreen>
  );
};
