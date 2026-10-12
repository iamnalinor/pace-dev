import { View } from "react-native";

import { Button } from "./button.tsx";
import { HOTKEYS } from "./hotkeys.ts";

/**
A closing row. A form's sheet has only its action, full width: leaving is the dim, the
cross or Escape. A confirmation (delete for good) keeps Cancel on the left, the action
twice as wide, as alert dialogs do.
*/
export const SheetActions = ({
  cancelLabel,
  isBusy = false,
  isDisabled = false,
  onCancel,
  onPrimary,
  primaryLabel,
}: {
  readonly cancelLabel?: string;
  readonly isBusy?: boolean;
  readonly isDisabled?: boolean;
  readonly onCancel?: () => void;
  readonly onPrimary: () => void;
  readonly primaryLabel: string;
}) => {
  // A confirmation (Delete for good) is never one keystroke away; a form's action is.
  const isConfirmation = onCancel !== undefined && cancelLabel !== undefined;
  return (
    <View className="flex-row gap-2">
      {isConfirmation ? (
        <View className="flex-1">
          <Button onPress={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
        </View>
      ) : null}
      <View className="flex-[2]">
        <Button
          busy={isBusy}
          disabled={isDisabled}
          hotkey={isConfirmation ? undefined : HOTKEYS.primary}
          onPress={onPrimary}
        >
          {primaryLabel}
        </Button>
      </View>
    </View>
  );
};
