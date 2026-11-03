import { Link } from "expo-router";
import { Text, View } from "react-native";

import { useT } from "../app-state.tsx";
import { appIntent, isAndroidBrowser } from "../auth/app-intent.ts";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";

/**
Where the bot's "Return to Pace" lands when Android did not open the app by itself (Telegram's
in-app browser, for one): a button that does, and the website as the other way on. Off Android
there is no app to open: the one button leads on to the website.
*/
export const LoginReturnScreen = () => {
  const t = useT();
  const isAndroid = isAndroidBrowser(globalThis.navigator.userAgent);
  return (
    <View className="flex-1 items-center justify-center bg-app px-4">
      <View className="w-full max-w-auth-card items-center gap-5 rounded-lg border border-separator bg-cell px-6 py-8">
        <PaceLogo heading={t("loginReturn.title")} wordmark={t("loginReturn.title")} />
        <Text className="text-center font-sans text-subhead font-normal text-label-secondary">
          {t("loginReturn.body")}
        </Text>
        <Button
          onPress={() => {
            globalThis.location.assign(isAndroid ? appIntent(globalThis.location.origin) : "/");
          }}
          width="fill"
        >
          {t("loginReturn.open")}
        </Button>
        {isAndroid ? (
          <Link
            className="px-2 py-3 font-sans text-footnote text-label-secondary underline"
            href="/"
          >
            {t("loginReturn.web")}
          </Link>
        ) : null}
      </View>
    </View>
  );
};
