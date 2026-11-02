import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth, useT } from "../app-state.tsx";
import { isPresent } from "../platform/strings.ts";
import { Button } from "../ui/button.tsx";

/**
Landing for `pace://auth?token=…` and `https://pace.nalinor.dev/app/auth?token=…`:
adopts the token, then goes home. A missing or rejected token offers the login screen.
*/
export const AuthScreen = () => {
  const t = useT();
  const router = useRouter();
  const { auth } = useAuth();
  const { token } = useLocalSearchParams<{ readonly token?: string }>();
  const [isFailed, setIsFailed] = useState(() => !isPresent(token));

  useEffect(() => {
    if (!isPresent(token)) {
      return;
    }
    const lifetime = new AbortController();
    void (async () => {
      const result = await auth.adoptToken(token);
      if (lifetime.signal.aborted) {
        return;
      }
      if (result.ok) {
        router.replace("/");
      } else {
        setIsFailed(true);
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, [auth, router, token]);

  if (isFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-app px-8">
        <Text className="text-center font-sans text-callout text-label-primary">
          {t("auth.invalidLink")}
        </Text>
        <Button
          onPress={() => {
            router.replace("/login");
          }}
          variant="secondary"
          width="fill"
        >
          {t("auth.backToLogin")}
        </Button>
      </View>
    );
  }
  if (!isPresent(token)) {
    return <Redirect href="/login" />;
  }
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-app">
      <ActivityIndicator accessibilityLabel={t("auth.signingIn")} />
      <Text className="font-sans text-subhead font-normal text-label-secondary">
        {t("auth.signingIn")}
      </Text>
    </View>
  );
};
