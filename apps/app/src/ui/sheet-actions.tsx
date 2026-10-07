import { View } from "react-native";

import { Button } from "./button.tsx";

/** A sheet's closing row: Cancel on the left, the primary action twice as wide. */
export const SheetActions = ({
  cancelLabel,
  isDisabled = false,
  onCancel,
  onPrimary,
  primaryLabel,
}: {
  readonly cancelLabel: string;
  readonly isDisabled?: boolean;
  readonly onCancel: () => void;
  readonly onPrimary: () => void;
  readonly primaryLabel: string;
}) => (
  <View className="flex-row gap-2">
    <View className="flex-1">
      <Button onPress={onCancel} variant="secondary">
        {cancelLabel}
      </Button>
    </View>
    <View className="flex-[2]">
      <Button disabled={isDisabled} onPress={onPrimary}>
        {primaryLabel}
      </Button>
    </View>
  </View>
);
