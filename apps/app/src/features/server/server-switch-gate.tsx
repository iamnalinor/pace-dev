import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useStore } from "zustand";

import { useT } from "#app/app-state.tsx";
import { serverHost } from "#app/platform/server-store.ts";
import { retryServerRestart, serverSwitchStore } from "#app/platform/server-switch-state.ts";
import { useBusyLatch } from "#app/shared/use-busy-latch.ts";
import { Button } from "#app/ui/button.tsx";
import { Text } from "#app/ui/text.tsx";

/**
The saved server waits for a cold start: what happened and the one way on. `onRestart` throws when
the app could not restart (the gallery hands in its own).
*/
export const ServerRestartPending = ({
  onRestart = retryServerRestart,
  origin,
}: {
  readonly onRestart?: () => void;
  readonly origin: string;
}) => {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const { isBusy, run } = useBusyLatch();
  const restart = (): void => {
    setFailed(false);
    void run(() => {
      try {
        onRestart();
        // The app restarts: the button stays busy until it is gone.
        return "hold";
      } catch {
        setFailed(true);
        return "failed";
      }
    });
  };
  return (
    <View className="flex-1 justify-center bg-app px-6">
      <View className="w-full max-w-message gap-8 self-center">
        <View className="gap-3">
          <Text level={1} role="title1">
            {t("server.restartPending")}
          </Text>
          <Text role="callout" tone="secondary">
            {t("server.restartExplanation", { host: serverHost(origin) })}
          </Text>
          {failed ? (
            <View role="alert">
              <Text role="footnote" tone="danger">
                {t("server.restartFailed")}
              </Text>
            </View>
          ) : null}
        </View>
        <Button busy={isBusy} onPress={restart}>
          {t("server.restartApp")}
        </Button>
      </View>
    </View>
  );
};

/** Holds every route and the old server's sign-in until the saved selection cold-starts. */
export const ServerSwitchGate = ({ children }: { readonly children: ReactNode }) => {
  const origin = useStore(serverSwitchStore, (state) => state.origin);
  return origin === null ? <>{children}</> : <ServerRestartPending origin={origin} />;
};
