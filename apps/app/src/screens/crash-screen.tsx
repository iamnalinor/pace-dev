import { reloadAppAsync } from "expo";
import { Text, View } from "react-native";

import { Button } from "#app/ui/button.tsx";
import { type Language, t } from "@pace/core";

/** The account may be what failed to load, so the crash screen reads the device's language. */
const deviceLanguage = (): Language =>
  new Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("ru") ? "ru" : "en";

/**
What a screen threw, instead of a blank page: a short apology, the error itself (to quote in a
bug report) and Reload, which restarts the app (on the web: the page, picking up a fixed build).
*/
export const CrashScreen = ({ error }: { readonly error: Error }) => {
  const language = deviceLanguage();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-bg px-6">
      <Text accessibilityRole="header" className="font-sans text-[20px] font-semibold text-fg">
        {t(language, "crash.title")}
      </Text>
      <Text className="max-w-[480px] text-center font-sans text-[14px] text-fg2">
        {t(language, "crash.body")}
      </Text>
      <Text className="max-w-[480px] text-center font-sans text-[12px] text-muted" selectable>
        {error.message}
      </Text>
      <Button
        onPress={() => {
          void reloadAppAsync();
        }}
      >
        {t(language, "crash.retry")}
      </Button>
    </View>
  );
};
