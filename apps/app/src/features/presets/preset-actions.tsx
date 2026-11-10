import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";

/**
Delete asks once more: the preset leaves the pickers (the toast's Undo, or Restore on the deleted
preset, brings it back). Focus goes to Cancel and back (bug class 5).
*/
const DeleteButton = ({
  name,
  onDelete,
}: {
  readonly name: string;
  readonly onDelete: () => void;
}) => {
  const t = useT();
  const [isConfirming, setIsConfirming] = useState(false);
  const focus = useConfirmFocus();
  const question = t("presets.deleteConfirm", { name });
  if (!isConfirming) {
    return (
      <Button
        onPress={() => {
          focus.toCancel();
          setIsConfirming(true);
        }}
        ref={focus.openerRef()}
        variant="plain"
      >
        {t("presets.archive")}
      </Button>
    );
  }
  return (
    <View
      aria-label={question}
      className="mx-4 mt-4 gap-2 rounded-xl border border-separator bg-cell p-4"
      role="group"
    >
      <Text
        accessibilityLiveRegion="polite"
        className="font-sans text-subhead font-normal text-label-primary"
        role="status"
      >
        {question}
      </Text>
      <SheetActions
        cancelLabel={t("common.cancel")}
        cancelRef={focus.cancelRef(question)}
        onCancel={() => {
          focus.toOpener();
          setIsConfirming(false);
        }}
        onPrimary={onDelete}
        primaryLabel={t("common.delete")}
      />
    </View>
  );
};

/** Save, and Delete for a preset that can go (`name` is `null` for one that cannot). */
export const PresetActions = ({
  name,
  onDelete,
  onSave,
}: {
  readonly name: null | string;
  readonly onDelete: () => void;
  readonly onSave: () => void;
}) => {
  const t = useT();
  return (
    <View className="gap-2 px-4 pt-4">
      <Button onPress={onSave}>{t("common.save")}</Button>
      {name === null ? null : <DeleteButton name={name} onDelete={onDelete} />}
    </View>
  );
};
