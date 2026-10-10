import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";

/** In a browser Pace asks for nothing: the permissions belong to the Android phone. */
export const PermissionsScreen = () => {
  const t = useT();
  return (
    <PushedScreen title={t("permissions.title")}>
      <Text className="px-5 pb-3 font-sans text-[14px] leading-5 text-fg2">
        {t("permissions.web")}
      </Text>
    </PushedScreen>
  );
};
