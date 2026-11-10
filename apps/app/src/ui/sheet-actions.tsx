import type { Ref } from "react";

import { View } from "react-native";

import { Button } from "./button.tsx";
import { HOTKEYS } from "./hotkeys.ts";
import { useRegisterSheetPrimary } from "./sheet-submit.tsx";

/** The row's box and its two cells, side by side or stacked. */
const LAYOUT = {
  row: { box: "flex-row gap-2", cancel: "flex-1", primary: "flex-2" },
  stack: { box: "gap-2", cancel: "self-stretch", primary: "self-stretch" },
} as const;

/** A confirmation's action takes no Enter; a destructive one wears the danger look. */
const primaryLook = (isConfirmation: boolean, isDestructive: boolean) => ({
  shortcut: isConfirmation ? undefined : HOTKEYS.primary,
  variant: isDestructive ? ("destructive" as const) : ("primary" as const),
});

/**
A closing row. A form's sheet has only its action, full width: leaving is the dim, the
cross or Escape. A confirmation (delete for good) keeps Cancel on the left, the action
twice as wide, as alert dialogs do; `isStacked` puts Cancel over the action, each
the full width, for a long action in a narrow box («Очистить через Telegram» ran three lines in
two thirds of a phone's box; design review H3).
*/
export const SheetActions = ({
  cancelLabel,
  cancelRef,
  isBusy = false,
  isDestructive = false,
  isDisabled = false,
  isStacked = false,
  onCancel,
  onPrimary,
  primaryLabel,
}: {
  readonly cancelLabel?: string;
  /** The Cancel button, to move focus onto it when an inline confirm opens. */
  readonly cancelRef?: Ref<View>;
  readonly isBusy?: boolean;
  /** The action cannot be undone: it wears the danger look, not the accent. */
  readonly isDestructive?: boolean;
  readonly isDisabled?: boolean;
  readonly isStacked?: boolean;
  readonly onCancel?: () => void;
  readonly onPrimary: () => void;
  readonly primaryLabel: string;
}) => {
  // A confirmation (Delete for good) is never one keystroke away; a form's action is.
  const isConfirmation = onCancel !== undefined && cancelLabel !== undefined;
  // Enter in a single-line field presses a form's action (QA round 21 M1), never a confirmation's.
  useRegisterSheetPrimary(
    isConfirmation ? null : { isEnabled: !isDisabled && !isBusy, press: onPrimary },
  );
  const layout = LAYOUT[isStacked ? "stack" : "row"];
  return (
    <View className={layout.box} testID="sheet-actions">
      {isConfirmation ? (
        <View className={layout.cancel}>
          {/* Escape cancels, as it closes the sheets and the Devices confirm (QA round 18 L1). */}
          <Button
            onPress={onCancel}
            ref={cancelRef}
            shortcut={HOTKEYS.escape}
            variant="secondary"
            width="fill"
          >
            {cancelLabel}
          </Button>
        </View>
      ) : null}
      <View className={layout.primary}>
        <Button
          busy={isBusy}
          disabled={isDisabled}
          onPress={onPrimary}
          {...primaryLook(isConfirmation, isDestructive)}
          width="fill"
        >
          {primaryLabel}
        </Button>
      </View>
    </View>
  );
};
