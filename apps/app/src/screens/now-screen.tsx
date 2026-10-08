import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { NowBoard } from "#app/features/now/now-screen.tsx";
import { TaskScreen } from "#app/features/task/task-screen.tsx";
import { TaskOpenerProvider, TaskPaneProvider } from "#app/shared/task-opener.tsx";
import { useIsWide } from "#app/ui/layout.ts";

type Picked = { readonly id: string; readonly close: boolean };

/** On a wide window the picked task opens next to the list, as on the old web app. */
const NowSplit = ({ composeText }: { readonly composeText?: string | undefined }) => {
  const t = useT();
  const [picked, setPicked] = useState<null | Picked>(null);
  return (
    <TaskOpenerProvider
      open={(id, options) => {
        setPicked({ close: options?.close === true, id });
      }}
    >
      <View className="flex-1 flex-row bg-bg">
        <View className="w-[560px] max-w-[50%] border-r border-line">
          <NowBoard composeText={composeText} />
        </View>
        <View className="flex-1">
          {picked === null ? (
            <View className="flex-1 items-center justify-center">
              <Text className="font-sans text-[14px] text-muted">{t("now.pickTask")}</Text>
            </View>
          ) : (
            <TaskPaneProvider
              onClose={() => {
                setPicked(null);
              }}
            >
              <TaskScreen id={picked.id} key={picked.id} openClose={picked.close} />
            </TaskPaneProvider>
          )}
        </View>
      </View>
    </TaskOpenerProvider>
  );
};

/** Now on a phone; on a wide window the list with the picked task beside it. */
export const NowScreen = ({ composeText }: { readonly composeText?: string | undefined }) =>
  useIsWide() ? <NowSplit composeText={composeText} /> : <NowBoard composeText={composeText} />;
