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
}) => (
  <View className="flex-row gap-2">
    {onCancel === undefined || cancelLabel === undefined ? null : (
      <View className="flex-1">
        <Button onPress={onCancel} variant="secondary">
          {cancelLabel}
        </Button>
      </View>
    )}
    <View className="flex-[2]">
      <Button busy={isBusy} disabled={isDisabled} hotkey={HOTKEYS.primary} onPress={onPrimary}>
        {primaryLabel}
      </Button>
    </View>
  </View>
);
