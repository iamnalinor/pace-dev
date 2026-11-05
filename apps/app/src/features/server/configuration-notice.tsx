import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useStore } from "zustand";

import type { FirebaseConfigReason } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { checkServer } from "#app/platform/server-origin.ts";
import { serverStore } from "#app/platform/server-store.ts";
import { Button } from "#app/ui/button.tsx";

import { configurationErrorKey } from "./configuration-error.ts";

const useConfigurationRetry = (onRecovered?: () => void) => {
  const runtime = usePace();
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const retry = async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    try {
      await checkServer(runtime);
      const current = serverStore.getState();
      if (current.origin === runtime.baseUrl && current.configurationError === null) {
        onRecovered?.();
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };
  return { busy, retry };
};

export const ConfigurationRetry = ({ onRecovered }: { readonly onRecovered?: () => void }) => {
  const t = useT();
  const { busy, retry } = useConfigurationRetry(onRecovered);
  return (
    <Button busy={busy} onPress={() => void retry()} variant="ghost">
      {t("sync.retry")}
    </Button>
  );
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
      <Text accessibilityRole="alert" className="text-center font-sans text-footnote text-danger">
        {t(configurationErrorKey(reason))}
      </Text>
      <Button busy={isChecking} onPress={onRetry} variant="ghost">
        {t("sync.retry")}
      </Button>
    </View>
  );
};

/** A configuration failure leaves sign-in on this server, with an explicit check to recover. */
export const ConfigurationNotice = () => {
  const { busy, retry } = useConfigurationRetry();
  const error = useStore(serverStore, (state) => state.configurationError);
  return error === null ? null : (
    <ConfigurationProblem isChecking={busy} onRetry={() => void retry()} reason={error.reason} />
  );
};
