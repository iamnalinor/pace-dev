import {
  Globe,
  Laptop,
  type LucideIcon,
  Plug,
  Smartphone,
  SquareTerminal,
} from "lucide-react-native";
import { type Ref, useRef, useState } from "react";
import { Text, View } from "react-native";

import type { SessionRow as Row } from "@pace/client";
import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { moveFocus } from "#app/platform/move-focus.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { cx } from "#app/ui/cx.ts";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

const ICON: Readonly<Record<Row["kind"], LucideIcon>> = {
  agent: Laptop,
  app: Smartphone,
  browser: Globe,
  dev: SquareTerminal,
  mcp: Plug,
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

/**
The kind's icon (its word leads the line under the name, so the icon is decoration), the name as
it came, whole however long (wrapped, never cut), and the viewer's line. Each part of that line
keeps together where it can: an address moves to the next line whole instead of breaking.
*/
const Identity = ({ row }: { readonly row: Row }) => {
  const { palette } = useTheme();
  const Icon = ICON[row.kind];
  return (
    <>
      <View
        aria-hidden
        className="h-8 w-8 items-center justify-center rounded-full bg-raised"
        importantForAccessibility="no-hide-descendants"
      >
        <Icon color={palette.fg2} size={18} strokeWidth={1.75} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-[15px] font-medium text-fg">{row.name}</Text>
        <View
          accessibilityLabel={row.meta.join(", ")}
          accessible
          className="flex-row flex-wrap"
          testID="session-meta"
        >
          {row.meta.map((part, index) => (
            // A part and the dot after it wrap together, so a line never starts with the dot.
            <View className="max-w-full flex-row" key={part}>
              <Text className="shrink font-sans text-[13px] text-muted">{part}</Text>
              {index === row.meta.length - 1 ? null : (
                <Text className="font-sans text-[13px] text-muted">{" · "}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </>
  );
};

/**
The confirm under a row: its question on a line of its own, then Cancel and the action side by side
in that order on every window (a phone splits the width a third to two thirds, as other confirms do;
a computer keeps both at their text's width, to the right).
*/
const Confirm = ({
  actionLabel,
  actionRef,
  cancelRef,
  isEnding,
  onCancel,
  onEnd,
  question,
}: {
  readonly actionLabel: string;
  readonly actionRef: Ref<View>;
  readonly cancelRef: Ref<View>;
  readonly isEnding: boolean;
  readonly onCancel: () => void;
  readonly onEnd: () => void;
  readonly question: string;
}) => {
  const t = useT();
  const isWide = useIsWide();
  const width = isWide ? "auto" : "fill";
  return (
    // Named by its question, so landing on Cancel inside it reads the question too.
    <View aria-label={question} className="gap-2 pl-11" role="group">
      <Text
        accessibilityLiveRegion="polite"
        className="font-sans text-[14px] text-fg"
        role="status"
      >
        {question}
      </Text>
      <View className={cx("flex-row gap-2", isWide && "justify-end")}>
        <View className={cx(!isWide && "flex-1")}>
          {/* Escape cancels, as it closes the sheets (QA round 15 L1); one confirm is open at a time. */}
          <Button
            hotkey={HOTKEYS.escape}
            onPress={onCancel}
            ref={cancelRef}
            variant="secondary"
            width={width}
          >
            {t("common.cancel")}
          </Button>
        </View>
        <View className={cx(!isWide && "flex-[2]")}>
          <Button busy={isEnding} onPress={onEnd} ref={actionRef} variant="danger" width={width}>
            {actionLabel}
          </Button>
        </View>
      </View>
    </View>
  );
};

/**
One way into the account: an icon for its kind, its name as it came (never translated), the
viewer's line under it, and Revoke (Disconnect for a computer) asked inline first. Opening the
confirm moves focus to its Cancel and says the question; Cancel gives focus back to the button,
and a failed end gives it back to the confirm's action (bug class 5; a successful one is the
list's to place, as the row goes). The confirm holds a synchronous latch, so presses landing in
one batch end the session once (bug class 36). The list holds which row is confirming, so one
confirm is open at a time.
*/
export const SessionRow = ({
  isConfirming,
  onConfirming,
  onEnd,
  openerRef,
  row,
}: {
  readonly row: Row;
  /** This row's confirm is the one open. */
  readonly isConfirming: boolean;
  /** Opens (true) or closes (false) this row's confirm. */
  readonly onConfirming: (isOpen: boolean) => void;
  /** Ends it: true once it is gone; a failure (false) is the caller's to show (the row stays). */
  readonly onEnd: () => Promise<boolean>;
  /** The row's Revoke or Disconnect button, for the list to move focus onto. */
  readonly openerRef?: (node: null | View) => void;
}) => {
  const t = useT();
  const [isEnding, setIsEnding] = useState(false);
  const sendingRef = useRef(false);
  const actionRef = useRef<View>(null);
  const focus = useConfirmFocus();
  const question = t(confirmKey(row));
  const actionLabel = t(row.action === "disconnect" ? "sessions.disconnect" : "sessions.revoke");
  const toOpener = focus.openerRef();
  const end = async (): Promise<void> => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setIsEnding(true);
    let isEnded: boolean;
    try {
      isEnded = await onEnd();
    } finally {
      // A failure keeps the row (and this confirm) for another try; a success removes the row.
      sendingRef.current = false;
      setIsEnding(false);
    }
    if (!isEnded) {
      // The busy action lost focus while it spun: it gets it back, for another try.
      moveFocus(actionRef.current);
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
              onConfirming(true);
            }}
            ref={(node: null | View) => {
              toOpener(node);
              openerRef?.(node);
            }}
            variant="secondary"
          >
            {actionLabel}
          </Button>
        )}
      </View>
      {isConfirming ? (
        <Confirm
          actionLabel={actionLabel}
          actionRef={actionRef}
          cancelRef={focus.cancelRef(question)}
          isEnding={isEnding}
          onCancel={() => {
            focus.toOpener();
            onConfirming(false);
          }}
          onEnd={() => void end()}
          question={question}
        />
      ) : null}
    </View>
  );
};
