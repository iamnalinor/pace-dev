import { useMemo } from "react";
import { View } from "react-native";
import { useStore } from "zustand";

import type { ServerProblem } from "#app/ui/sync-frame.tsx";
import type { FirebaseConfigReason } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { checkServer } from "#app/platform/server-origin.ts";
import { serverStore } from "#app/platform/server-store.ts";
import { Button } from "#app/ui/button.tsx";
import { Text } from "#app/ui/text.tsx";

import { configurationErrorKey } from "./configuration-error.ts";
import { useBusyLatch } from "./use-busy-latch.ts";

const useConfigurationRetry = () => {
  const runtime = usePace();
  const { isBusy, run } = useBusyLatch();
  const retry = (): void => {
    void run(async () => {
      await checkServer(runtime);
    });
  };
  return { isBusy, retry };
};

/** The sync strip's Retry for a server problem, as drawn (the gallery shows it without a server). */
export const ConfigurationRetryButton = ({
  isBusy,
  onPress,
}: {
  readonly isBusy: boolean;
  readonly onPress: () => void;
}) => {
  const t = useT();
  return (
    <Button busy={isBusy} onPress={onPress} size="small" variant="plain">
      {t("sync.retry")}
    </Button>
  );
};

/** Asks the misconfigured server again now, rather than at the end of the automatic re-check. */
const ConfigurationRetry = () => {
  const { isBusy, retry } = useConfigurationRetry();
  return <ConfigurationRetryButton isBusy={isBusy} onPress={retry} />;
};

export const ConfigurationProblem = ({
  reason,
  onRetry,
  isChecking,
}: {
  readonly reason: FirebaseConfigReason | null;
  readonly onRetry: () => void;
  readonly isChecking: boolean;
}) => {
  const t = useT();
  return (
    <View className="gap-2">
      <View role="alert">
        <Text className="text-center" role="footnote" tone="danger">
          {t(configurationErrorKey(reason))}
        </Text>
      </View>
      <Button busy={isChecking} onPress={onRetry} variant="plain">
        {t("sync.retry")}
      </Button>
    </View>
  );
};

/**
The current server's configuration problem for the sync strip (the app's composer hands it to
`SyncFrame`): its sentence and Retry; `null` while the server is fine.
*/
export const useServerProblem = (): null | ServerProblem => {
  const error = useStore(serverStore, (state) => state.configurationError);
  return useMemo(
    () =>
      error === null
        ? null
        : { action: <ConfigurationRetry />, message: configurationErrorKey(error.reason) },
    [error],
  );
};

/** A configuration failure leaves sign-in on this server, with an explicit check to recover. */
export const ConfigurationNotice = () => {
  const { isBusy, retry } = useConfigurationRetry();
  const error = useStore(serverStore, (state) => state.configurationError);
  return error === null ? null : (
    <ConfigurationProblem isChecking={isBusy} onRetry={retry} reason={error.reason} />
  );
};
