import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";

/** The phone's walk-through has nothing to ask in a browser: a note and the way on. */
export const OnboardingScreen = () => {
  const t = useT();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-5">
      <View className="w-full max-w-[560px] gap-4">
        <Text accessibilityRole="header" className="font-sans text-[22px] font-semibold text-fg">
          {t("onboarding.web.title")}
        </Text>
        <Text className="font-sans text-[14px] leading-5 text-fg2">{t("permissions.web")}</Text>
        <Button
          onPress={() => {
            router.replace("/");
          }}
        >
          {t("onboarding.web.continue")}
        </Button>
      </View>
    </View>
  );
};
