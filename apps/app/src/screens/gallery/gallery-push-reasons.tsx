import { View } from "react-native";

import type { FcmIneligibilityReason } from "#app/platform/push-eligibility.ts";

import { PushIneligibilityReason } from "#app/features/settings/notification-settings.tsx";

const REASONS: readonly Exclude<FcmIneligibilityReason, null>[] = [
  "server-disabled",
  "package-missing",
  "restart-needed",
  "initialization-failed",
  "storage-failed",
  "unsupported",
  "invalid-config",
  "configuration-pending",
  "other-project",
  "services-unavailable",
];

const NOTHING = (): void => undefined;

/** Fixed availability fixtures: no push/native/server store is changed to render a state. */
export const NotificationAvailability = () => (
  <View className="gap-3" testID="gallery-push-reasons">
    {REASONS.map((reason) => (
      <View className="rounded-xl border border-separator bg-cell p-4" key={reason}>
        <PushIneligibilityReason onRestart={NOTHING} reason={reason} />
      </View>
    ))}
    <PushIneligibilityReason reason={null} />
  </View>
);
