import type { ReactNode } from "react";

import { View } from "react-native";

import { useIsAccountUnknown, useT } from "#app/app-state.tsx";

import { Icon, type IconName } from "./icon.tsx";
import { Skeleton } from "./skeleton.tsx";
import { Text } from "./text.tsx";

/**
A screen's "nothing here" (spec §4.2.10): leading-aligned at the gutter where the first row would
be, never centred, so nothing jumps when the first row lands; [an icon] · the title (`headline`) ·
what lands here (`callout`, secondary) · one action. Until a sync of this session has succeeded on
an empty copy nothing is known to be empty: grey rows stand in, never the final copy (QA round 18
M5: "Nothing to do right now" showed, in the device's language, before the account's tasks came).
A failed first sync keeps them too (QA round 21 M4: a pull answered 500 drew "Nothing to do" for an
account with seven tasks); the sync frame's line says it has not loaded and offers Retry.
*/
export const EmptyState = ({
  action,
  body,
  icon,
  title,
}: {
  readonly title: string;
  readonly body?: string | undefined;
  readonly icon?: IconName | undefined;
  /** One action (a small secondary `Button` or a `Link`). */
  readonly action?: ReactNode;
}) => {
  const t = useT();
  const isUnknown = useIsAccountUnknown();
  return isUnknown ? (
    <View className="w-full px-gutter lg:px-gutter-lg">
      <Skeleton label={t("sync.loadingData")} />
    </View>
  ) : (
    <View className="items-start gap-2 px-gutter py-6 lg:px-gutter-lg" testID="empty-state">
      {icon === undefined ? null : <Icon name={icon} size="bar" tone="tertiary" />}
      <Text role="headline">{title}</Text>
      {body === undefined ? null : (
        <Text role="callout" tone="secondary">
          {body}
        </Text>
      )}
      {action}
    </View>
  );
};

/**
A screen's inline "nothing here" line (Day, Insights, History), with the same rule: a grey line,
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
    <Skeleton label={t("sync.loadingData")} rows={1} shape="text" />
  ) : (
    <Text className={className} role="callout" tone="secondary">
      {children}
    </Text>
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
    <View className="w-full px-gutter py-2 lg:px-gutter-lg">
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
  return isUnknown ? <Skeleton label={t("sync.loadingData")} rows={1} shape="listRow" /> : children;
};
