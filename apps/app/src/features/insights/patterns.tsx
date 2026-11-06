import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { fillClass } from "#app/ui/hue.ts";
import { Text } from "#app/ui/text.tsx";
import {
  focusSleepRows,
  fragmentationTiles,
  HOUR_TICKS,
  hourLabel,
  type InsightsModel,
} from "@pace/client";
import { CATEGORY_HUES, formatDuration } from "@pace/core";

import { Card } from "./card.tsx";

/** Focus is drawn in the work color, sleep in the sleep category's, as on Day. */
const FOCUS_FILL = fillClass(CATEGORY_HUES.work);
/** The hours chart is one series: slate, no accent and no category (spec §5.15). */
const HOURS_FILL = "bg-hue-slate-stroke";
const SLEEP_FILL = fillClass(CATEGORY_HUES.sleep);

const percent = (share: number): `${number}%` => `${Math.max(2, Math.round(share * 100))}%`;

/** Focus minutes by hour of day: 24 thin columns from a zero baseline, the busiest hour in text. */
const HoursChart = ({ hours }: { readonly hours: InsightsModel["hours"] }) => {
  const t = useT();
  const { language } = useViewer();
  const most = Math.max(1, ...hours.minutes);
  const described = hours.minutes
    .map((minutes, hour) => ({ hour, minutes }))
    .filter((row) => row.minutes > 0)
    .map((row) =>
      t("insights.hourValue", {
        duration: formatDuration(row.minutes, language),
        hour: hourLabel(row.hour),
      }),
    )
    .join(", ");
  return (
    <Card title={t("insights.hours")}>
      {hours.peak === null ? null : (
        <Text role="caption" tone="secondary">
          {t("insights.hoursPeak", { from: hourLabel(hours.peak), to: hourLabel(hours.peak + 1) })}
        </Text>
      )}
      <View
        accessibilityLabel={described}
        className="h-24 flex-row items-end gap-0.5 border-b border-separator"
        role="group"
      >
        {hours.minutes.map((minutes, hour) => (
          <View className="h-full flex-1 justify-end" key={hourLabel(hour)}>
            {minutes > 0 ? (
              <View
                className={cx("w-full rounded-t-xs", HOURS_FILL)}
                style={{ height: percent(minutes / most) }}
              />
            ) : null}
          </View>
        ))}
      </View>
      <View className="flex-row">
        {HOUR_TICKS.map((hour) => (
          <Text className="flex-1" key={hour} numeric role="caption2" tone="tertiary">
            {hourLabel(hour)}
          </Text>
        ))}
      </View>
    </Card>
  );
};

/** Three headline numbers: how long focus lasted, how often it broke, how often the activity changed. */
const FragmentationCard = ({
  fragmentation,
}: {
  readonly fragmentation: InsightsModel["fragmentation"];
}) => {
  const t = useT();
  const tiles = fragmentationTiles(fragmentation, useViewer().language);
  return tiles === null ? null : (
    <Card title={t("insights.fragmentation")}>
      {/* Two tiles to a row on a phone, each wide enough for its longest word, so a row wraps
          between words and never inside one (F-TYP-04; QA round 17 L12). */}
      <View className="flex-row flex-wrap gap-2">
        {tiles.map((tile) => (
          <View
            accessibilityLabel={`${t(tile.key)}: ${tile.value}`}
            className="min-w-32 flex-1 gap-1 rounded-sm bg-inset p-3"
            key={tile.key}
            role="group"
          >
            <Text role="footnote" tone="secondary">
              {t(tile.key)}
            </Text>
            <Text role="numeric.stat">{tile.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};

const Bar = ({ fill, share }: { readonly fill: string; readonly share: number }) => (
  <View className="h-2 overflow-hidden rounded-r-xs bg-fill-2">
    {share > 0 ? (
      <View className={cx("h-full rounded-r-xs", fill)} style={{ width: percent(share) }} />
    ) : null}
  </View>
);

/** Each day: the night before and the day's focus, two columns each on its own scale. */
const FocusSleepCard = ({
  days,
  zone,
}: {
  readonly days: InsightsModel["focusSleep"];
  readonly zone: string;
}) => {
  const t = useT();
  const rows = focusSleepRows(days, { language: useViewer().language, zone });
  return rows === null ? null : (
    <Card title={t("insights.focusSleep")}>
      <View className="flex-row gap-3">
        <View className="w-10" />
        <Text className="flex-1" role="caption" tone="secondary">
          {t("insights.sleepBefore")}
        </Text>
        <Text className="flex-1" role="caption" tone="secondary">
          {t("insights.focus")}
        </Text>
      </View>
      {rows.map((row) => (
        <View className="flex-row gap-3" key={row.date}>
          <Text className="w-10" role="caption" tone="secondary">
            {row.weekday}
          </Text>
          <View className="flex-1 gap-1">
            <Bar fill={SLEEP_FILL} share={row.sleepShare} />
            <Text numeric role="caption">
              {row.sleepText ?? t("insights.notLogged")}
            </Text>
          </View>
          <View className="flex-1 gap-1">
            <Bar fill={FOCUS_FILL} share={row.focusShare} />
            <Text numeric role="caption">
              {row.focusText}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
};

/** The week's patterns: when focus happens, how broken up it is, how it follows sleep. */
export const Patterns = ({
  week,
  zone,
}: {
  readonly week: InsightsModel;
  readonly zone: string;
}) => (
  <>
    <HoursChart hours={week.hours} />
    <FragmentationCard fragmentation={week.fragmentation} />
    <FocusSleepCard days={week.focusSleep} zone={zone} />
  </>
);
