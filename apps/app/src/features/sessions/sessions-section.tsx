import { useRouter } from "expo-router";
import { type RefObject, useRef, useState } from "react";
import { Text, View } from "react-native";

import { useAuth, usePace, useSettings, useT } from "#app/app-state.tsx";
import { IS_PHONE } from "#app/platform/device.ts";
import { moveFocus } from "#app/platform/move-focus.ts";
import { useOnReturn } from "#app/platform/on-return.ts";
import { useSignInsChanged } from "#app/shared/notifications/use-sign-ins-changed.ts";
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

/** The list could not load: a quiet line and Try again under it. */
const ListFailed = ({ onRetry }: { readonly onRetry: () => void }) => {
  const t = useT();
  return (
    // The ghost button sits under the line, its label flush with it: wrapped beside the line it
    // came out indented by its own padding (QA round 15 L10).
    <View className="items-start">
      <Text className="font-sans text-[14px] text-muted">{t("sessions.failed")}</Text>
      <View className="-ml-4">
        <Button onPress={onRetry} variant="ghost">
          {t("sessions.retry")}
        </Button>
      </View>
    </View>
  );
};

/**
The rows of a loaded list. Ending this device's own session is logging out: it signs out and goes
to the login card.
*/
const ReadyList = ({
  afterLast,
  sessions,
}: {
  readonly sessions: Sessions;
  /** Where focus goes when the last row is ended: the section's next control. */
  readonly afterLast: RefObject<null | View>;
}) => {
  const t = useT();
  const router = useRouter();
  const { auth } = useAuth();
  const { timezone } = useSettings();
  const { deviceTz, language, now } = useViewer();
  const [hasEndFailed, setHasEndFailed] = useState(false);
  // The one row whose confirm is open: opening another closes it (QA round 15 L1).
  const [confirming, setConfirming] = useState<null | string>(null);
  // Each row's Revoke or Disconnect, by id: an ended row's focus goes to the next one's.
  const openersRef = useRef(new Map<string, View>());
  const rows = sessionRows(sessions.sessions, { language, now, zone: timezone ?? deviceTz });
  /** The row's going takes its controls with it: focus moves on, never to the page (class 5). */
  const focusAfter = (row: Row): void => {
    const at = rows.findIndex((item) => item.id === row.id);
    // Forward in reading order: the next row's action, else the control after the list.
    const next = rows
      .slice(at + 1)
      .map((item) => openersRef.current.get(item.id))
      .find((node) => node !== undefined);
    moveFocus(next ?? afterLast.current);
  };
  const didEnd = async (row: Row): Promise<boolean> => {
    try {
      await sessions.revoke(row.id);
    } catch {
      // The row stays, its confirm open for another try; the line under the list says why.
      setHasEndFailed(true);
      return false;
    }
    setHasEndFailed(false);
    if (!row.isCurrent) {
      focusAfter(row);
      return true;
    }
    await auth.logout();
    router.replace("/login");
    return true;
  };
  return (
    <View>
      {rows.map((row) => (
        <SessionRow
          isConfirming={confirming === row.id}
          key={row.id}
          onConfirming={(isOpen) => {
            setConfirming(isOpen ? row.id : null);
            setHasEndFailed(false);
          }}
          onEnd={async () => await didEnd(row)}
          openerRef={(node) => {
            if (node === null) {
              openersRef.current.delete(row.id);
            } else {
              openersRef.current.set(row.id, node);
            }
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

/** The list itself: skeleton rows while it loads, a quiet retry line when it cannot, then the rows. */
const SessionList = ({
  afterLast,
  sessions,
}: {
  readonly sessions: Sessions;
  readonly afterLast: RefObject<null | View>;
}) => {
  const t = useT();
  if (sessions.status === "loading") {
    return <Skeleton label={t("sessions.loading")} />;
  }
  return sessions.status === "error" ? (
    <ListFailed onRetry={sessions.reload} />
  ) : (
    <ReadyList afterLast={afterLast} sessions={sessions} />
  );
};

/**
Keeps the list current (QA round 15 M1): it reloads when the person comes back to the app or the
tab, and when a sign-in notice arrives or is answered (one request for both).
*/
const useLiveSessions = (sessions: Sessions): void => {
  useOnReturn(useSignInsChanged(sessions.reload));
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
  useLiveSessions(sessions);
  const [opened, setOpened] = useState<Opened>(null);
  const computerButtonRef = useRef<View>(null);
  const close = () => {
    setOpened(null);
  };
  return (
    <View className="gap-3">
      <Text className="font-sans text-[13px] leading-[18px] text-muted">{t("sessions.hint")}</Text>
      {IS_PHONE ? <CalendarSyncRow /> : null}
      <SessionList afterLast={computerButtonRef} sessions={sessions} />
      <View className={cx("gap-2", isWide && "flex-row flex-wrap")}>
        <Button
          onPress={() => {
            setOpened("addComputer");
          }}
          ref={computerButtonRef}
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
