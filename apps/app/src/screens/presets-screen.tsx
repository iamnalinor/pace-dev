import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { PresetsList } from "#app/features/presets/presets-list.tsx";

import { PushedScreen } from "./pushed-screen.tsx";

export const PresetsScreen = () => {
  const t = useT();
  return (
    <PushedScreen title={t("presets.title")}>
      <Text className="mx-5 mb-3 font-sans text-caption font-normal text-label-tertiary">
        {t("settings.presets.hint")}
      </Text>
      <PresetsList />
    </PushedScreen>
  );
};
