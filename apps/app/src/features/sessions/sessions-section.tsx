import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { useAuth, usePace, useSettings, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { Skeleton } from "#app/ui/skeleton.tsx";
import { type SessionRow as Row, sessionRows } from "@pace/client";
import { type Sessions, useSessions } from "@pace/client/react";

import { AddComputer } from "./add-computer.tsx";
import { CalendarSyncRow } from "./calendar-sync-row.tsx";
import { ConnectAiSheet } from "./connect-ai-sheet.tsx";
import { SessionRow } from "./session-row.tsx";

/** The sheet open over the section, if any. */
type Opened = "addComputer" | "connectAi" | null;

/**
The list itself: skeleton rows while it loads, a quiet retry line when it cannot, then the rows.
Ending this device's own session is logging out: it signs out and goes to the login card.
*/
const SessionList = ({ sessions }: { readonly sessions: Sessions }) => {
  const t = useT();
  const router = useRouter();
  const { auth } = useAuth();
  const { timezone } = useSettings();
  const { deviceTz, language, now } = useViewer();
  const [hasEndFailed, setHasEndFailed] = useState(false);
  if (sessions.status === "loading") {
    return <Skeleton label={t("sessions.loading")} />;
  }
  if (sessions.status === "error") {
    return (
      <View className="flex-row flex-wrap items-center gap-x-2">
        <Text className="font-sans text-[14px] text-muted">{t("sessions.failed")}</Text>
        <Button onPress={sessions.reload} variant="ghost">
          {t("sessions.retry")}
        </Button>
      </View>
    );
  }
  const end = async (row: Row): Promise<void> => {
    try {
      await sessions.revoke(row.id);
    } catch {
      // The row stays, its confirm open for another try; the line under the list says why.
      setHasEndFailed(true);
      return;
    }
    setHasEndFailed(false);
    if (!row.isCurrent) {
      return;
    }
    await auth.logout();
    router.replace("/login");
  };
  const rows = sessionRows(sessions.sessions, { language, now, zone: timezone ?? deviceTz });
  return (
    <View>
      {rows.map((row) => (
        <SessionRow
          key={row.id}
          onEnd={async () => {
            await end(row);
          }}
          row={row}
        />
      ))}
      {hasEndFailed ? (
        <Text accessibilityRole="alert" className="pt-1 font-sans text-[14px] text-warn">
          {t("sessions.revokeFailed")}
        </Text>
      ) : null}
    </View>
  );
};

/**
Settings → Devices and sessions, inline: every way into the account (browsers, this app,
computers' agents, MCP apps) from one `useSessions`, so a revoke or a new computer shows in the
same list; under it, adding a computer and connecting an AI app.
*/
export const SessionsSection = () => {
  const t = useT();
  const { api } = usePace();
  const isWide = useIsWide();
  const sessions = useSessions(api);
  const [opened, setOpened] = useState<Opened>(null);
  const close = () => {
    setOpened(null);
  };
  return (
    <View className="gap-3">
      <Text className="font-sans text-[13px] leading-[18px] text-muted">{t("sessions.hint")}</Text>
      {IS_PHONE ? <CalendarSyncRow /> : null}
      <SessionList sessions={sessions} />
      <View className={cx("gap-2", isWide && "flex-row flex-wrap")}>
        <Button
          onPress={() => {
            setOpened("addComputer");
          }}
          variant="secondary"
        >
          {t("devices.add")}
        </Button>
        <Button
          onPress={() => {
            setOpened("connectAi");
          }}
          variant="secondary"
        >
          {t("connectAi.open")}
        </Button>
      </View>
      {opened === "addComputer" ? (
        <AddComputer create={sessions.createAgent} onClose={close} />
      ) : null}
      <ConnectAiSheet onClose={close} open={opened === "connectAi"} />
    </View>
  );
};
