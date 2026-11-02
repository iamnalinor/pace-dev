import { usePathname, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";

/** An address the app does not have (a typo, an old link): say so, and offer the way home. */
export const NotFoundScreen = () => {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-app px-6">
      <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
        {t("errors.pageNotFound")}
      </Text>
      <Text className="text-center font-sans text-subhead font-normal text-label-secondary">
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
