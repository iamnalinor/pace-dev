import { Link } from "expo-router";
import { Text, View } from "react-native";

import { useT } from "../app-state.tsx";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";

/** The App Link the bot's "Return to Pace" opens, as an intent Chrome hands to the app. */
const OPEN_APP =
  "intent://pace.nalinor.dev/app/login#Intent;scheme=https;package=dev.nalinor.pace;end";

/**
Where the bot's "Return to Pace" lands when Android did not open the app by itself (Telegram's
in-app browser, for one): a button that does, and the website as the other way on.
*/
export const LoginReturnScreen = () => {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-4">
      <View className="w-full max-w-[400px] items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-8">
        <PaceLogo heading={t("loginReturn.title")} wordmark={t("loginReturn.title")} />
        <Text className="text-center font-sans text-[14px] text-fg2">{t("loginReturn.body")}</Text>
        <Button
          onPress={() => {
            globalThis.location.assign(OPEN_APP);
          }}
        >
          {t("loginReturn.open")}
        </Button>
        <Link className="font-sans text-[13px] text-muted underline" href="/">
          {t("loginReturn.web")}
        </Link>
      </View>
    </View>
  );
};
