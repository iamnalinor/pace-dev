import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { TextField } from "#app/ui/text-field.tsx";

const DEFAULT_TELEGRAM_ID = "1919230638";

/** Local and e2e only: name a whitelisted Telegram id instead of running the widget. */
export const DevIdentity = ({
  onIdentify,
}: {
  readonly onIdentify: (telegramId: string) => void;
}) => {
  const t = useT();
  const [telegramId, setTelegramId] = useState(DEFAULT_TELEGRAM_ID);
  const trimmed = telegramId.trim();
  return (
    <View className="gap-2 rounded-lg border border-dashed border-line p-3">
      <Text className="font-sans text-[11px] uppercase tabular-nums tracking-[0.06em] text-muted">
        {t("login.dev")}
      </Text>
      <TextField
        inputMode="numeric"
        label={t("login.devId")}
        onChangeText={setTelegramId}
        value={telegramId}
      />
      <Button
        disabled={trimmed === ""}
        onPress={() => {
          onIdentify(trimmed);
        }}
        variant="secondary"
      >
        {t("oauth.devUse")}
      </Button>
    </View>
  );
};
