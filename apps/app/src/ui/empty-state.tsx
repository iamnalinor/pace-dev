import type { ReactNode } from "react";

import { Text, View } from "react-native";

import { useIsFirstSync, useT } from "#app/app-state.tsx";

import { Skeleton } from "./skeleton.tsx";

/**
Centered hint for screens with nothing to show yet. While the first sync of an empty copy is still
under way (the cover has given the app back after its bound) nothing is known to be empty: grey
rows stand in, never the final copy (QA round 18 M5: "Nothing to do right now" showed, in the
device's language, before the account's tasks came).
*/
export const EmptyState = ({
  children,
  icon,
}: {
  readonly children: string;
  readonly icon?: ReactNode;
}) => {
  const t = useT();
  const isFirstSync = useIsFirstSync();
  return isFirstSync ? (
    <View className="w-full px-4">
      <Skeleton label={t("sync.loadingData")} />
    </View>
  ) : (
    <View className="flex-1 items-center justify-center gap-3 px-10">
      {icon}
      <Text className="text-center font-sans text-[14px] leading-5 text-muted">{children}</Text>
    </View>
  );
};

/**
A screen's inline "nothing here" line (Day, Insights, History), with the same rule: grey rows,
never the final words, while the first sync of an empty copy is under way.
*/
export const EmptyText = ({
  children,
  className,
}: {
  readonly children: string;
  readonly className: string;
}) => {
  const t = useT();
  const isFirstSync = useIsFirstSync();
  return isFirstSync ? (
    <Skeleton label={t("sync.loadingData")} rows={1} />
  ) : (
    <Text className={className}>{children}</Text>
  );
};
