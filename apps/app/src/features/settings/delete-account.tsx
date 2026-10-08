import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { useAuth, useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";

/** Deleting the account asks once more, says what goes, and lands on the login card. */
export const DeleteAccount = () => {
  const t = useT();
  const router = useRouter();
  const { auth } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  if (!isConfirming) {
    return (
      <Button
        onPress={() => {
          setIsConfirming(true);
        }}
        variant="ghost"
      >
        {t("settings.deleteAccount")}
      </Button>
    );
  }
  const remove = async (): Promise<void> => {
    setIsBusy(true);
    setHasFailed(false);
    const result = await auth.deleteAccount();
    setIsBusy(false);
    if (result.ok) {
      router.replace("/login");
    } else {
      setHasFailed(true);
    }
  };
  return (
    <View className="gap-3 rounded-xl border-2 border-warn bg-surface p-3.5">
      <Text className="font-sans text-[14px] leading-5 text-fg">
        {t("settings.deleteAccount.warning")}
      </Text>
      {hasFailed ? (
        <Text accessibilityRole="alert" className="font-sans text-[13px] text-warn">
          {t("settings.deleteAccount.failed")}
        </Text>
      ) : null}
      <SheetActions
        cancelLabel={t("common.cancel")}
        isBusy={isBusy}
        onCancel={() => {
          setIsConfirming(false);
        }}
        onPrimary={() => void remove()}
        primaryLabel={t("settings.deleteAccount.confirm")}
      />
    </View>
  );
};
