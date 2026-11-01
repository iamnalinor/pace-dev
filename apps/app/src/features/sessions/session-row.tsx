import {
  Globe,
  Laptop,
  type LucideIcon,
  Plug,
  Smartphone,
  SquareTerminal,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import type { SessionRow as Row } from "@pace/client";
import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

const ICON: Readonly<Record<Row["kind"], LucideIcon>> = {
  agent: Laptop,
  app: Smartphone,
  browser: Globe,
  dev: SquareTerminal,
  mcp: Plug,
};

const KIND_KEY: Readonly<Record<Row["kind"], MessageKey>> = {
  agent: "sessions.kind.agent",
  app: "sessions.kind.app",
  browser: "sessions.kind.browser",
  dev: "sessions.kind.dev",
  mcp: "sessions.kind.mcp",
};

/** What the confirmation asks: this device signs out; a computer's token stops; an app loses access. */
const confirmKey = (row: Row): MessageKey => {
  if (row.action === "disconnect") {
    return "sessions.disconnectConfirm";
  }
  if (row.kind === "mcp") {
    return "sessions.revokeAppConfirm";
  }
  return row.isCurrent ? "sessions.revokeCurrentConfirm" : "sessions.revokeConfirm";
};

/** The kind's icon (named for screen readers), the name as it came and the viewer's line. */
const Identity = ({ row }: { readonly row: Row }) => {
  const t = useT();
  const { palette } = useTheme();
  const Icon = ICON[row.kind];
  return (
    <>
      <View
        accessibilityLabel={t(KIND_KEY[row.kind])}
        accessibilityRole="image"
        className="h-8 w-8 items-center justify-center rounded-full bg-raised"
      >
        <Icon color={palette.fg2} size={18} strokeWidth={1.75} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-[15px] font-medium text-fg" numberOfLines={1}>
          {row.name}
        </Text>
        {row.meta.length === 0 ? null : (
          <Text className="font-sans text-[13px] text-muted">{row.meta.join(" · ")}</Text>
        )}
      </View>
    </>
  );
};

/**
One way into the account: an icon for its kind, its name as it came (never translated), the
viewer's line under it, and Revoke (Disconnect for a computer) asked inline first. Opening the
confirm moves focus to its Cancel and says the question; Cancel gives focus back to the button
(bug class 5). The confirm holds a synchronous latch, so presses landing in one batch end the
session once (bug class 36).
*/
export const SessionRow = ({
  onEnd,
  row,
}: {
  readonly row: Row;
  /** Ends it; a failure is the caller's to show (the row stays). */
  readonly onEnd: () => Promise<void>;
}) => {
  const t = useT();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const sendingRef = useRef(false);
  const focus = useConfirmFocus();
  const question = t(confirmKey(row));
  const actionLabel = t(row.action === "disconnect" ? "sessions.disconnect" : "sessions.revoke");
  const end = async (): Promise<void> => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setIsEnding(true);
    try {
      await onEnd();
    } finally {
      // A failure keeps the row (and this confirm) for another try; a success removes the row.
      sendingRef.current = false;
      setIsEnding(false);
    }
  };
  return (
    <View aria-label={row.name} className="gap-2 py-1" role="group">
      <View className="min-h-12 flex-row items-center gap-3">
        <Identity row={row} />
        {isConfirming ? null : (
          <Button
            onPress={() => {
              focus.toCancel();
              setIsConfirming(true);
            }}
            ref={focus.openerRef()}
            variant="ghost"
          >
            {actionLabel}
          </Button>
        )}
      </View>
      {isConfirming ? (
        // Named by its question, so landing on Cancel inside it reads the question too.
        <View
          aria-label={question}
          className="flex-row flex-wrap items-center gap-2 pl-11"
          role="group"
        >
          <Text
            accessibilityLiveRegion="polite"
            className="min-w-[160px] flex-1 font-sans text-[14px] text-fg"
            role="status"
          >
            {question}
          </Text>
          <Button
            onPress={() => {
              focus.toOpener();
              setIsConfirming(false);
            }}
            ref={focus.cancelRef(question)}
            variant="ghost"
          >
            {t("common.cancel")}
          </Button>
          <Button busy={isEnding} onPress={() => void end()} variant="danger">
            {actionLabel}
          </Button>
        </View>
      ) : null}
    </View>
  );
};
