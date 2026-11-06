import type { Ref } from "react";

import { View } from "react-native";

import { Button } from "./button.tsx";
import { HOTKEYS } from "./hotkeys.ts";
import { useRegisterSheetPrimary } from "./sheet-submit.tsx";

/**
A closing row. A form's sheet has only its action, full width: leaving is the dim, the
cross or Escape. A confirmation (delete for good) keeps Cancel on the left, the action
twice as wide, as alert dialogs do.
*/
export const SheetActions = ({
  cancelLabel,
  cancelRef,
  isBusy = false,
  isDestructive = false,
  isDisabled = false,
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
  return (
    <View className="flex-row gap-2">
      {isConfirmation ? (
        <View className="flex-1">
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
      <View className="flex-2">
        <Button
          busy={isBusy}
          disabled={isDisabled}
          onPress={onPrimary}
          shortcut={isConfirmation ? undefined : HOTKEYS.primary}
          variant={isDestructive ? "destructive" : "primary"}
          width="fill"
        >
          {primaryLabel}
        </Button>
      </View>
    </View>
  );
};
