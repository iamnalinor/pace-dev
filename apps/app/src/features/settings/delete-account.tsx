import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { AccountAction, AccountConfirmation, AccountConfirmationStatus } from "@pace/client";

import { useAuth, useSync, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { useToast } from "#app/ui/toast.tsx";

import {
  clearPendingConfirmation,
  readPendingConfirmation,
  savePendingConfirmation,
} from "./confirmation-pending.ts";

type Notice = "cancelled" | "expired" | "failed" | "noTelegram" | "replaced" | null;

const NOTICE_KEY = {
  cancelled: "settings.confirmation.cancelled",
  expired: "settings.confirmation.expired",
  failed: "settings.confirmation.failed",
  noTelegram: "settings.confirmation.noTelegram",
  replaced: "settings.confirmation.replaced",
} as const;

const terminalNotice = (status: AccountConfirmationStatus): Notice => {
  if (status === "pending") {
    return null;
  }
  return status === "confirmed" ? "failed" : status;
};

type PollInput = {
  readonly action: AccountAction | null;
  readonly request: AccountConfirmation | null;
  readonly onTerminal: (notice: Notice) => void;
};

/** Polls through the opaque ID, which remains readable after Delete revokes the session. */
const useConfirmationPoll = ({ action, onTerminal, request }: PollInput): void => {
  const { auth } = useAuth();
  const { syncNow } = useSync();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  useEffect(() => {
    if (request === null || action === null) {
      return;
    }
    let isActive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finishConfirmed = async (): Promise<void> => {
      onTerminal(null);
      if (action === "delete") {
        await auth.finishAccountDeletion();
        router.replace("/login");
      } else {
        await syncNow();
        toast.show({ message: t("settings.wipe.done") });
      }
    };
    const poll = async (): Promise<void> => {
      const result = await auth.accountConfirmationStatus(request.id);
      if (!isActive) {
        return;
      }
      if (result.ok && result.value === "confirmed") {
        await finishConfirmed();
        return;
      }
      const notice = result.ok ? terminalNotice(result.value) : null;
      if (notice !== null || Date.now() >= Date.parse(request.expiresAt)) {
        onTerminal(notice ?? "expired");
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };
    timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [action, auth, onTerminal, request, router, syncNow, t, toast]);
};

const useDangerFlow = () => {
  const { auth } = useAuth();
  const [restored] = useState(() => readPendingConfirmation(Date.now()));
  const [action, setAction] = useState<AccountAction | null>(restored?.action ?? null);
  const [request, setRequest] = useState<AccountConfirmation | null>(restored?.request ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const onTerminal = (next: Notice): void => {
    clearPendingConfirmation();
    setRequest(null);
    setAction(null);
    setNotice(next);
  };
  useConfirmationPoll({ action, request, onTerminal });
  const begin = async (): Promise<void> => {
    if (action === null) {
      return;
    }
    setIsBusy(true);
    const result = await auth.requestAccountConfirmation(action);
    setIsBusy(false);
    if (result.ok) {
      savePendingConfirmation({ action, request: result.value });
      setRequest(result.value);
      setNotice(null);
    } else {
      setNotice(result.error === "account/no-telegram" ? "noTelegram" : "failed");
    }
  };
  const cancel = async (): Promise<void> => {
    if (request !== null) {
      await auth.cancelAccountConfirmation(request.id);
    }
    onTerminal("cancelled");
  };
  return { action, begin, cancel, isBusy, notice, request, setAction, setNotice };
};

const DangerPrompt = ({ flow }: { readonly flow: ReturnType<typeof useDangerFlow> }) => {
  const t = useT();
  return flow.action === null ? (
    <View className="flex-row flex-wrap gap-2">
      <View className="self-start">
        <Button
          onPress={() => {
            flow.setAction("wipe");
            flow.setNotice(null);
          }}
          variant="secondary"
        >
          {t("settings.wipe")}
        </Button>
      </View>
      <View className="self-start">
        <Button
          onPress={() => {
            flow.setAction("delete");
            flow.setNotice(null);
          }}
          variant="ghost"
        >
          {t("settings.deleteAccount")}
        </Button>
      </View>
    </View>
  ) : (
    <View className="gap-3 rounded-xl border border-warn bg-surface p-4">
      <Text className="font-sans text-[14px] leading-5 text-fg">
        {t(flow.action === "wipe" ? "settings.wipe.warning" : "settings.deleteAccount.warning")}
      </Text>
      {flow.request === null ? (
        <SheetActions
          cancelLabel={t("common.cancel")}
          isBusy={flow.isBusy}
          onCancel={() => {
            flow.setAction(null);
          }}
          onPrimary={() => {
            void flow.begin();
          }}
          primaryLabel={t(
            flow.action === "wipe" ? "settings.wipe.confirm" : "settings.deleteAccount.confirm",
          )}
        />
      ) : (
        <View className="gap-2">
          <Text accessibilityLiveRegion="polite" className="font-sans text-[13px] text-fg2">
            {t("settings.confirmation.waiting")}
          </Text>
          <View className="self-start">
            <Button
              onPress={() => {
                void flow.cancel();
              }}
              variant="ghost"
            >
              {t("common.cancel")}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
};

/** A local confirm, then a Telegram confirm, with a terminal state after account deletion. */
export const DangerZone = () => {
  const t = useT();
  const flow = useDangerFlow();
  return (
    <View className="gap-3">
      <Text className="font-sans text-[14px] font-semibold text-warn">{t("settings.danger")}</Text>
      <DangerPrompt flow={flow} />
      {flow.notice === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-[13px] text-warn">
          {t(NOTICE_KEY[flow.notice])}
        </Text>
      )}
    </View>
  );
};
