import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";

import { useT } from "#app/app-state.tsx";
import { PlaceholderScreen } from "#app/screens/placeholder-screen.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";

export default function NowScreen() {
  const t = useT();
  const router = useRouter();
  return (
    <PlaceholderScreen
      emptyKey="now.empty"
      isDated
      right={
        <IconButton
          icon={Settings}
          label={t("nav.settings")}
          onPress={() => {
            router.push("/settings");
          }}
        />
      }
      titleKey="nav.now"
    />
  );
}
