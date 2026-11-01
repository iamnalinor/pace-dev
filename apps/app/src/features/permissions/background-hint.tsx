import { View } from "react-native";

import { useT } from "#app/app-state.tsx";

import { PermissionAction, PermissionText } from "./permission-card.tsx";
import { usePermissions } from "./use-permissions.ts";

/**
Under the push picker in Settings: the battery step's reason and its Allow while the exemption
is missing, only while the phone checks in the background. It reads the walk-through's own list
(`usePermissions`, which keeps the step only when `needsBackgroundStep`), so the two never
disagree (bug class 1).
*/
export const BackgroundHint = () => {
  const t = useT();
  const { byId, request } = usePermissions();
  const background = byId("background");
  if (background === undefined || background.state === "on") {
    return null;
  }
  return (
    <View
      accessibilityLabel={t("permissions.background")}
      className="items-start gap-2"
      role="group"
    >
      <PermissionText id="background" />
      <PermissionAction
        onRequest={(permission) => {
          void request(permission);
        }}
        permission={background}
      />
    </View>
  );
};
