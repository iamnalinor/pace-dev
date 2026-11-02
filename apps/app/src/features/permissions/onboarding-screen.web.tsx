import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";

/** The phone's walk-through has nothing to ask in a browser: a note and the way on. */
export const OnboardingScreen = () => {
  const t = useT();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-app px-5">
      <View className="w-full max-w-narrow-column gap-4">
        <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
          {t("onboarding.web.title")}
        </Text>
        <Text className="font-sans text-subhead font-normal text-label-secondary">
          {t("permissions.web")}
        </Text>
        <Button
          onPress={() => {
            router.replace("/");
          }}
          width="fill"
        >
          {t("onboarding.web.continue")}
        </Button>
      </View>
    </View>
  );
};
