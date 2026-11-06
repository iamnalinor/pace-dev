import { type ReactNode, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import { useT } from "#app/app-state.tsx";
import { serverHost } from "#app/platform/server-store.ts";
import { retryServerRestart, serverSwitchStore } from "#app/platform/server-switch-state.ts";
import { Button } from "#app/ui/button.tsx";

const RestartSelectedServer = ({ origin }: { readonly origin: string }) => {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const restart = (): void => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      retryServerRestart();
    } catch {
      setFailed(true);
      pendingRef.current = false;
      setBusy(false);
    }
  };
  return (
    <View className="flex-1 justify-center bg-app px-6">
      <View className="w-full max-w-message gap-8 self-center">
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
            {t("server.restartPending")}
          </Text>
          <Text className="font-sans text-callout text-label-secondary">
            {t("server.restartExplanation", { host: serverHost(origin) })}
          </Text>
          {failed ? (
            <Text accessibilityRole="alert" className="font-sans text-footnote text-danger">
              {t("server.restartFailed")}
            </Text>
          ) : null}
        </View>
        <Button busy={busy} onPress={restart}>
          {t("server.restartApp")}
        </Button>
      </View>
    </View>
  );
};

/** Holds every route and the old server's sign-in until the saved selection cold-starts. */
export const ServerSwitchGate = ({ children }: { readonly children: ReactNode }) => {
  const origin = useStore(serverSwitchStore, (state) => state.origin);
  return origin === null ? <>{children}</> : <RestartSelectedServer origin={origin} />;
};
