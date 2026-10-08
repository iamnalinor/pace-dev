import { Text, View } from "react-native";

import { useT } from "../app-state.tsx";
import { Button } from "../ui/button.tsx";
import { PaceLogo } from "../ui/logo.tsx";

const APP_LINK_HOST = "pace.nalinor.dev";
const ANDROID_PACKAGE = "dev.nalinor.pace";

/** The login token from `?token=` or `#token=`. */
const readToken = (): null | string => {
  const { hash, search } = globalThis.location;
  return (
    new URLSearchParams(search).get("token") ?? new URLSearchParams(hash.slice(1)).get("token")
  );
};

const intentUrl = (token: string): string =>
  `intent://${APP_LINK_HOST}/app/auth?token=${encodeURIComponent(token)}#Intent;scheme=https;package=${ANDROID_PACKAGE};end`;

/** The App Link lands here when Android did not open the app: hand the token over via intent://. */
export const AppLinkScreen = () => {
  const t = useT();
  const token = readToken();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-4">
      <View className="w-full max-w-[400px] items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-8">
        <PaceLogo heading={t("appLink.title")} wordmark={t("appLink.title")} />
        {token === null ? (
          <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
            {t("appLink.missing")}
          </Text>
        ) : (
          <>
            <Button
              onPress={() => {
                globalThis.location.assign(intentUrl(token));
              }}
            >
              {t("appLink.open")}
            </Button>
            <Text className="text-center font-sans text-[13px] text-muted">
              {t("appLink.fallback")}
            </Text>
          </>
        )}
      </View>
    </View>
  );
};
