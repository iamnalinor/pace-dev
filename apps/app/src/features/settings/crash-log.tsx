import { useState } from "react";
import { Share, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";

import { paceNative } from "../../../modules/pace-native/index.ts";

/** How much of the log's end the row shows; Share sends all of it. */
const PREVIEW_CHARS = 1200;

/** The crash log's text ("" when there is none) and a way to clear it. */
export const useCrashLog = (): { readonly text: string; readonly clear: () => void } => {
  const [text, setText] = useState(() => paceNative.readCrashLog());
  return {
    clear: () => {
      paceNative.clearCrashLog();
      setText("");
    },
    text,
  };
};

/** The newest reports, to share with whoever fixes the app, or to clear. */
export const CrashLogActions = ({
  onClear,
  text,
}: {
  readonly onClear: () => void;
  readonly text: string;
}) => {
  const t = useT();
  return (
    <View className="gap-3">
      <Text className="rounded-md bg-surface p-3 font-mono text-[11px] text-muted" selectable>
        {text.trimEnd().slice(-PREVIEW_CHARS)}
      </Text>
      <Button onPress={() => void Share.share({ message: text })} variant="secondary">
        {t("crash.share")}
      </Button>
      <Button onPress={onClear} variant="ghost">
        {t("settings.crashLog.clear")}
      </Button>
    </View>
  );
};
