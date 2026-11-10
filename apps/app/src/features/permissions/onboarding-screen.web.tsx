import { useRouter } from "expo-router";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { Text } from "#app/ui/text.tsx";

/** The phone's walk-through has nothing to ask in a browser: a note and the way on. */
export const OnboardingScreen = () => {
  const t = useT();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-app px-5">
      <View className="w-full max-w-narrow-column gap-4">
        <Text level={1} role="title1">
          {t("onboarding.web.title")}
        </Text>
        <Text role="subhead" tone="secondary">
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
