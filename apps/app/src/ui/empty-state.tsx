import type { ReactNode } from "react";

import { Text, View } from "react-native";

import { useIsAccountUnknown, useT } from "#app/app-state.tsx";

import { Skeleton } from "./skeleton.tsx";

/**
Centered hint for screens with nothing to show yet. Until a sync of this session has succeeded on
an empty copy nothing is known to be empty: grey rows stand in, never the final copy (QA round 18
M5: "Nothing to do right now" showed, in the device's language, before the account's tasks came).
A failed first sync keeps them too (QA round 21 M4: a pull answered 500 drew "Nothing to do" for an
account with seven tasks); the sync frame's line says it has not loaded and offers Retry.
*/
export const EmptyState = ({
  children,
  icon,
}: {
  readonly children: string;
  readonly icon?: ReactNode;
}) => {
  const t = useT();
  const isUnknown = useIsAccountUnknown();
  return isUnknown ? (
    <View className="w-full px-4">
      <Skeleton label={t("sync.loadingData")} />
    </View>
  ) : (
    <View className="flex-1 items-center justify-center gap-3 px-10">
      {icon}
      <Text className="text-center font-sans text-subhead font-normal text-label-secondary">
        {children}
      </Text>
    </View>
  );
};

/**
A screen's inline "nothing here" line (Day, Insights, History), with the same rule: grey rows,
never the final words, until a sync of this session has succeeded on an empty copy.
*/
export const EmptyText = ({
  children,
  className,
}: {
  readonly children: string;
  readonly className: string;
}) => {
  const t = useT();
  const isUnknown = useIsAccountUnknown();
  return isUnknown ? (
    <Skeleton label={t("sync.loadingData")} rows={1} />
  ) : (
    <Text className={className}>{children}</Text>
  );
};

/**
A screen's figures and lists (Day's totals, timeline and screen time, Week's grid, the Assistant
log, the presets) until a sync of this session has succeeded on an empty copy: grey rows stand in
for all of them, so no total reads 0 and no list says it is empty before the account's data came
(QA round 19 M1), a failed first sync included (round 7 review 12, QA round 21 M4). `isWaiting`:
the screen is still loading its own answer from the server too.
*/
export const FirstSyncBody = ({
  children,
  isWaiting = false,
}: {
  readonly children: ReactNode;
  readonly isWaiting?: boolean;
}) => {
  const t = useT();
  const isUnknown = useIsAccountUnknown();
  if (!isWaiting && !isUnknown) {
    return <>{children}</>;
  }
  return (
    <View className="w-full px-5 py-2">
      <Skeleton label={t("sync.loadingData")} />
    </View>
  );
};

/**
A control showing one of the account's values (its language, a switch, digest times): until a
sync of this session has succeeded on an empty copy the value is not known, so a grey row stands
in, never a default drawn as the account's own and never a control that would write over it (QA
round 20 M1); a failed first sync keeps it waiting (round 7 review 12).
*/
export const KnownAfterSync = ({ children }: { readonly children: ReactNode }) => {
  const t = useT();
  const isUnknown = useIsAccountUnknown();
  return isUnknown ? <Skeleton label={t("sync.loadingData")} rows={1} /> : children;
};
