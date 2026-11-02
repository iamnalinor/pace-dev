import type { ReactNode } from "react";

import { Text, View } from "react-native";
import { useStore } from "zustand";

import { useAuth, useT } from "#app/app-state.tsx";
import { serverHost, serverStore } from "#app/platform/server-store.ts";
import { Button } from "#app/ui/button.tsx";

/** Whether a signed-in person is held at the versions screen (the app and its server do not fit). */
export const useIsServerBlocked = (): boolean => {
  const { status } = useAuth();
  const serverStatus = useStore(serverStore, (state) => state.status);
  return status === "signed-in" && serverStatus === "incompatible";
};

/**
"Server and app versions don't match", signed in: what to update and one way out, Log out. The
server is changed only signed out (the session belongs to this server), so after logging out the
login screen offers Change; this screen does not.
*/
const IncompatibleScreen = () => {
  const t = useT();
  const { auth } = useAuth();
  const { origin, reason } = useStore(serverStore);
  return (
    <View className="flex-1 justify-center bg-app px-6">
      {/* A centred column on a computer, as the login card is, not the window's left edge. */}
      <View className="w-full max-w-inspector-max gap-8 self-center">
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
            {t("server.mismatch")}
          </Text>
          <Text className="font-sans text-callout text-label-secondary">
            {t(reason === "client-outdated" ? "server.mismatchApp" : "server.mismatchServer")}
          </Text>
          <Text className="font-sans text-footnote text-label-secondary">
            {t("server.line", { host: serverHost(origin) })}
          </Text>
        </View>
        <Button onPress={() => void auth.logout()} variant="secondary">
          {t("settings.logout")}
        </Button>
      </View>
    </View>
  );
};

/** In place of every signed-in screen while the versions do not fit; the screens otherwise. */
export const IncompatibleGate = ({ children }: { readonly children: ReactNode }) =>
  useIsServerBlocked() ? <IncompatibleScreen /> : <>{children}</>;
