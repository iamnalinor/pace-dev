import { useT } from "#app/app-state.tsx";
import { PushedScreen } from "#app/screens/pushed-screen.tsx";
import { Text } from "#app/ui/text.tsx";

/** In a browser Pace asks for nothing: the permissions belong to the Android phone. */
export const PermissionsScreen = () => {
  const t = useT();
  return (
    <PushedScreen title={t("permissions.title")}>
      <Text className="px-gutter pb-3" role="subhead" tone="secondary">
        {t("permissions.web")}
      </Text>
    </PushedScreen>
  );
};
