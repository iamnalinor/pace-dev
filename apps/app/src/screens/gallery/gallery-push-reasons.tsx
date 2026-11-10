import { View } from "react-native";

import type { FcmIneligibilityReason } from "#app/platform/push-eligibility.ts";

import { useT } from "#app/app-state.tsx";
import { configurationErrorKey } from "#app/features/server/configuration-error.ts";
import {
  ConfigurationProblem,
  ConfigurationRetryButton,
} from "#app/features/server/configuration-notice.tsx";
import { ServerRestartPending } from "#app/features/server/server-switch-gate.tsx";
import { PushIneligibilityReason } from "#app/features/settings/notification-settings.tsx";
import { SyncPill } from "#app/ui/sync-frame.tsx";

import { Section } from "./gallery-kit.tsx";

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

/** The gallery's restart always fails, so a press shows the failure line instead of restarting. */
const RESTART_FAILS = (): void => {
  throw new Error("gallery");
};

/** A long self-hosted address: the explanation names its host. */
const LONG_ORIGIN = "https://pace.a-rather-long-self-hosted-server-name.example.org:8443";

/** Fixed availability fixtures: no push/native/server store is changed to render a state. */
const NotificationAvailability = () => (
  <View className="gap-3" testID="gallery-push-reasons">
    {REASONS.map((reason) => (
      <View className="rounded-lg border border-separator bg-cell p-4" key={reason}>
        <PushIneligibilityReason onRestart={NOTHING} reason={reason} />
      </View>
    ))}
    <PushIneligibilityReason reason={null} />
  </View>
);

/**
The sync strip's server-problem card at its longest (the duplicate-package sentence, 103
characters in Russian) and its shortest, checking while asked again: it wraps beside Retry.
*/
const ConfigurationStrips = () => {
  const t = useT();
  return (
    <View className="items-center gap-3" testID="gallery-configuration-strip">
      <SyncPill
        action={<ConfigurationRetryButton isBusy={false} onPress={NOTHING} />}
        icon="triangle-alert"
        isStacked
        message={t(configurationErrorKey("duplicate-android-package"))}
      />
      <SyncPill
        action={<ConfigurationRetryButton isBusy onPress={NOTHING} />}
        icon="triangle-alert"
        isStacked
        message={t(configurationErrorKey(null))}
      />
    </View>
  );
};

/** A server whose configuration is refused, and every reason push is not offered. */
export const ServerSections = () => (
  <>
    <Section title="server.misconfigured">
      <ConfigurationProblem
        isChecking={false}
        onRetry={NOTHING}
        reason="duplicate-android-package"
      />
      <ConfigurationProblem isChecking onRetry={NOTHING} reason={null} />
      <ConfigurationStrips />
    </Section>
    <Section title="server.restartPending">
      <View className="rounded-lg border border-separator py-6" testID="gallery-server-restart">
        <ServerRestartPending onRestart={RESTART_FAILS} origin={LONG_ORIGIN} />
      </View>
    </Section>
    <Section title="settings.push.hint">
      <NotificationAvailability />
    </Section>
  </>
);
