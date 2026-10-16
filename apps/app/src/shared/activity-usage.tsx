import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { appsDuring, type AppTime, screenTime } from "@pace/client";
import { useDevices, useUsage } from "@pace/client/react";
import { addDaysIn, formatDuration } from "@pace/core";

const TOP_APPS = 8;

/** One app, its devices and a bar relative to the longest row. */
const AppRow = ({ app, max }: { readonly app: AppTime; readonly max: number }) => {
  const { language } = useViewer();
  const percent = Math.max(4, Math.round((app.minutes / max) * 100));
  return (
    <View className="gap-1.5 py-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text className="min-w-0 flex-1 font-sans text-[13px] text-fg" numberOfLines={1}>
          {app.app}
        </Text>
        <Text className="font-sans text-[11px] text-muted" numberOfLines={1}>
          {app.deviceNames.join(", ")}
        </Text>
        <Text className="font-sans text-[12px] tabular-nums text-fg2">
          {formatDuration(app.minutes, language)}
        </Text>
      </View>
      <View className="h-1 overflow-hidden rounded-full bg-line">
        <View className="h-full rounded-full bg-accentQuiet" style={{ width: `${percent}%` }} />
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
  const { phase } = useDevices(api);
  const apps = appsDuring(usage, { startAt, endAt: end });
  const stale =
    phase.kind === "ready"
      ? phase.devices.filter(
          (device) => device.lastActivityAt === null || device.lastActivityAt < end,
        )
      : [];
  return (
    <View className="gap-2 border-t border-line pt-4">
      <Text accessibilityRole="header" className="font-sans text-[14px] font-semibold text-fg">
        {t("day.appsDuring")}
      </Text>
      {apps.length === 0 ? (
        <Text className="font-sans text-[13px] text-muted">{t("day.noApps")}</Text>
      ) : (
        <AppList apps={apps} />
      )}
      {stale.map((device) => (
        <Text className="font-sans text-[11px] text-muted" key={device.id}>
          {device.lastActivityAt === null
            ? t("day.noDeviceData", { device: device.name })
            : t("day.dataUpTo", {
                device: device.name,
                time: clockTime(device.lastActivityAt, zone),
              })}
        </Text>
      ))}
    </View>
  );
};

/** Day footer: all devices, then apps ordered by time in the account's local day. */
export const ScreenTimeSection = ({
  date,
  zone,
}: {
  readonly date: string;
  readonly zone: string;
}) => {
  const t = useT();
  const { api } = usePace();
  const { language } = useViewer();
  const [isExpanded, setIsExpanded] = useState(false);
  const usage = useUsage(api, date, addDaysIn(date, 1, zone));
  const report = screenTime(usage, date, zone);
  const shown = isExpanded ? report.apps : report.apps.slice(0, TOP_APPS);
  return (
    <View className="mx-5 mt-5 gap-3 border-t border-line pb-8 pt-5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text accessibilityRole="header" className="font-sans text-[17px] font-semibold text-fg">
          {t("day.screenTime")}
        </Text>
        <Text className="font-sans text-[13px] tabular-nums text-fg2">
          {formatDuration(report.totalMinutes, language)}
        </Text>
      </View>
      {report.devices.length === 0 ? (
        <Text className="font-sans text-[13px] text-muted">{t("day.noApps")}</Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            {report.devices.map((device) => (
              <Text className="font-sans text-[12px] text-fg2" key={device.id}>
                {t("day.deviceTime", {
                  device: device.name,
                  duration: formatDuration(device.minutes, language),
                })}
              </Text>
            ))}
          </View>
          <AppList apps={shown} />
          {report.apps.length > TOP_APPS ? (
            <Pressable
              accessibilityRole="button"
              className="self-start py-2"
              onPress={() => {
                setIsExpanded(!isExpanded);
              }}
            >
              <Text className="font-sans text-[13px] text-accentQuietText">
                {isExpanded ? t("day.showLess") : t("day.showAll", { count: report.apps.length })}
              </Text>
            </Pressable>
          ) : null}
          {report.apps.length > 0 ? (
            <Text className="font-sans text-[11px] text-muted">
              {t("day.firstLast", {
                from: clockTime(
                  report.apps.map((app) => app.firstAt).toSorted((a, b) => a.localeCompare(b))[0] ??
                    report.from,
                  zone,
                ),
                to: clockTime(
                  report.apps
                    .map((app) => app.lastAt)
                    .toSorted((a, b) => a.localeCompare(b))
                    .at(-1) ?? report.to,
                  zone,
                ),
              })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
};
