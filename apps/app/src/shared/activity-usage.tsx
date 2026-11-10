import { useState } from "react";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Group } from "#app/ui/group.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Text as KitText } from "#app/ui/text.tsx";
import { appsDuring, type AppTime, screenTime } from "@pace/client";
import { useSessions, useUsage } from "@pace/client/react";
import { formatDuration, type UsageRow } from "@pace/core";

const TOP_APPS = 8;

/** One app, its devices and a bar relative to the longest row. */
const AppRow = ({ app, max }: { readonly app: AppTime; readonly max: number }) => {
  const { language } = useViewer();
  const percent = Math.max(4, Math.round((app.minutes / max) * 100));
  return (
    <View className="gap-2 py-2">
      <View className="flex-row items-baseline gap-2">
        <KitText className="flex-1" policy="truncate" role="footnote">
          {app.app}
        </KitText>
        <KitText className="font-normal" policy="truncate" role="caption2" tone="tertiary">
          {app.deviceNames.join(", ")}
        </KitText>
        <Text className="font-sans text-caption font-normal tabular-nums text-label-secondary">
          {formatDuration(app.minutes, language)}
        </Text>
      </View>
      <View className="h-1 overflow-hidden rounded-pill bg-fill-4">
        <View className="h-full rounded-pill bg-accent-quiet" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
};

const AppList = ({ apps }: { readonly apps: readonly AppTime[] }) => {
  const max = apps[0]?.minutes ?? 1;
  return (
    <View className="gap-0.5">
      {apps.map((app) => (
        <AppRow app={app} key={app.app} max={max} />
      ))}
    </View>
  );
};

/** Apps used while one activity ran, shared by Day's editor and Week's details. */
export const ActivityApps = ({
  endAt,
  startAt,
  zone,
}: {
  readonly startAt: string;
  readonly endAt: null | string;
  readonly zone: string;
}) => {
  const t = useT();
  const { api } = usePace();
  const { now } = useViewer();
  const end = endAt ?? now;
  const usage = useUsage(api, startAt, end);
  const { sessions } = useSessions(api);
  const apps = appsDuring(usage, { startAt, endAt: end });
  // The computers, and the phones that have sent usage, behind on this stretch.
  const stale = sessions.filter((session) =>
    session.lastDataAt === null
      ? session.kind === "agent"
      : (session.kind === "app" || session.kind === "agent") && session.lastDataAt < end,
  );
  return (
    <View className="gap-2 border-t border-separator pt-4">
      <Text
        accessibilityRole="header"
        className="font-sans text-subhead font-semibold text-label-primary"
      >
        {t("day.appsDuring")}
      </Text>
      {apps.length === 0 ? (
        <Text className="font-sans text-footnote text-label-secondary">{t("day.noApps")}</Text>
      ) : (
        <AppList apps={apps} />
      )}
      {stale.map((session) => (
        <Text className="font-sans text-caption2 font-normal text-label-tertiary" key={session.id}>
          {session.lastDataAt === null
            ? t("day.noDeviceData", { device: session.name })
            : t("day.dataUpTo", {
                device: session.name,
                time: clockTime(session.lastDataAt, zone),
              })}
        </Text>
      ))}
    </View>
  );
};

/** A failed read is not "nothing recorded" (QA round 23 R23-08): no total, a way to ask again. */
const ScreenTimeFailed = ({ onRetry }: { readonly onRetry: () => void }) => {
  const t = useT();
  return (
    <View className="pb-8">
      <SectionHeader title={t("day.screenTime")} />
      <Group>
        <View className="items-start px-row-x py-row-y">
          <KitText role="footnote" tone="secondary">
            {t("day.screenTimeFailed")}
          </KitText>
          <View className="-ml-4">
            <Button onPress={onRetry} variant="plain">
              {t("common.retry")}
            </Button>
          </View>
        </View>
      </Group>
    </View>
  );
};

type ScreenTimeProps = {
  readonly date: string;
  readonly zone: string;
  /** The day's usage, read once by the screen (QA round 21 L5: two parts read it twice). */
  readonly usage: readonly UsageRow[];
};

/** Day footer: all devices, then apps ordered by time in the account's local day. */
export const ScreenTimeSection = ({
  onRetry = null,
  ...report
}: ScreenTimeProps & {
  /** Set when the day's usage could not be read: the section says so with Try again, no zero. */
  readonly onRetry?: (() => void) | null;
}) =>
  onRetry === null ? <ScreenTimeReport {...report} /> : <ScreenTimeFailed onRetry={onRetry} />;

/** "First 09:12, last 21:40": when the day's apps were first and last used. */
const FirstLast = ({
  report,
  zone,
}: {
  readonly report: ReturnType<typeof screenTime>;
  readonly zone: string;
}) => {
  const t = useT();
  const first = report.apps.map((app) => app.firstAt).toSorted((a, b) => a.localeCompare(b))[0];
  const last = report.apps
    .map((app) => app.lastAt)
    .toSorted((a, b) => a.localeCompare(b))
    .at(-1);
  return (
    <View className="px-row-x py-row-y">
      <KitText role="caption2" tone="tertiary">
        {t("day.firstLast", {
          from: clockTime(first ?? report.from, zone),
          to: clockTime(last ?? report.to, zone),
        })}
      </KitText>
    </View>
  );
};

/** Each device's time, or that nothing was recorded. */
const DeviceTimes = ({ report }: { readonly report: ReturnType<typeof screenTime> }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-row-x py-row-y">
      {report.devices.map((device) => (
        <KitText key={device.id} role="caption" tone="secondary">
          {t("day.deviceTime", {
            device: device.name,
            duration: formatDuration(device.minutes, language),
          })}
        </KitText>
      ))}
    </View>
  );
};

const ScreenTimeReport = ({ date, usage, zone }: ScreenTimeProps) => {
  const t = useT();
  const { language } = useViewer();
  const [isExpanded, setIsExpanded] = useState(false);
  const report = screenTime(usage, date, zone);
  const shown = isExpanded ? report.apps : report.apps.slice(0, TOP_APPS);
  const max = report.apps[0]?.minutes ?? 1;
  return (
    <View className="pb-8">
      <SectionHeader
        action={
          <KitText numeric role="footnote" tone="secondary">
            {formatDuration(report.totalMinutes, language)}
          </KitText>
        }
        title={t("day.screenTime")}
      />
      <Group>
        {report.devices.length === 0 ? (
          <View className="px-row-x py-row-y">
            <KitText role="footnote" tone="secondary">
              {t("day.noApps")}
            </KitText>
          </View>
        ) : (
          <DeviceTimes report={report} />
        )}
        {shown.map((app) => (
          <View className="px-row-x" key={app.app}>
            <AppRow app={app} max={max} />
          </View>
        ))}
        {report.apps.length > TOP_APPS ? (
          <Button
            onPress={() => {
              setIsExpanded(!isExpanded);
            }}
            variant="plain"
          >
            {isExpanded ? t("day.showLess") : t("day.showAll", { count: report.apps.length })}
          </Button>
        ) : null}
        {report.apps.length > 0 ? <FirstLast report={report} zone={zone} /> : null}
      </Group>
    </View>
  );
};
