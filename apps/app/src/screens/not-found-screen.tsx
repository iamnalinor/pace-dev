import { usePathname, useRouter } from "expo-router";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Text } from "#app/ui/text.tsx";

/** An address the app does not have (a typo, an old link): say so, and offer the way home. */
export const NotFoundScreen = () => {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-app px-6">
      <Text level={1} role="title1">
        {t("errors.pageNotFound")}
      </Text>
      <Text className="text-center" role="subhead" tone="secondary">
        {t("errors.pageNotFoundBody", { path })}
      </Text>
      <Button
        onPress={() => {
          router.replace("/");
        }}
        variant="secondary"
        width="fill"
      >
        {t("common.home")}
      </Button>
    </View>
  );
};
