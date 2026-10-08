import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { PROJECT_FILL } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import {
  focusSleepRows,
  fragmentationTiles,
  HOUR_TICKS,
  hourLabel,
  type InsightsModel,
} from "@pace/client";
import { CATEGORY_COLORS, formatDuration } from "@pace/core";

import { Card } from "./card.tsx";

/** Focus is drawn in the work color, sleep in the sleep category's, as on Day. */
const FOCUS_FILL = PROJECT_FILL[CATEGORY_COLORS.work];
const SLEEP_FILL = PROJECT_FILL[CATEGORY_COLORS.sleep];

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
        <Text className="font-sans text-[12px] text-fg2">
          {t("insights.hoursPeak", { from: hourLabel(hours.peak), to: hourLabel(hours.peak + 1) })}
        </Text>
      )}
      <View
        accessibilityLabel={described}
        className="h-24 flex-row items-end gap-0.5 border-b border-line"
      >
        {hours.minutes.map((minutes, hour) => (
          <View className="h-full flex-1 justify-end" key={hourLabel(hour)}>
            {minutes > 0 ? (
              <View
                className={cx("w-full rounded-t", FOCUS_FILL)}
                style={{ height: percent(minutes / most) }}
              />
            ) : null}
          </View>
        ))}
      </View>
      <View className="flex-row">
        {HOUR_TICKS.map((hour) => (
          <Text className="flex-1 font-mono text-[11px] text-muted" key={hour}>
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
      <View className="flex-row gap-2">
        {tiles.map((tile) => (
          <View
            accessibilityLabel={`${t(tile.key)}: ${tile.value}`}
            className="flex-1 gap-1 rounded-lg bg-raised p-3"
            key={tile.key}
          >
            <Text className="font-sans text-[11px] text-fg2">{t(tile.key)}</Text>
            <Text className="font-mono text-[16px] text-fg">{tile.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};

const Bar = ({ fill, share }: { readonly fill: string; readonly share: number }) => (
  <View className="h-2 overflow-hidden rounded-r bg-track">
    {share > 0 ? (
      <View className={cx("h-full rounded-r", fill)} style={{ width: percent(share) }} />
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
        <Text className="flex-1 font-sans text-[12px] text-fg2">{t("insights.sleepBefore")}</Text>
        <Text className="flex-1 font-sans text-[12px] text-fg2">{t("insights.focus")}</Text>
      </View>
      {rows.map((row) => (
        <View className="flex-row gap-3" key={row.date}>
          <Text className="w-10 font-sans text-[12px] text-fg2">{row.weekday}</Text>
          <View className="flex-1 gap-1">
            <Bar fill={SLEEP_FILL} share={row.sleepShare} />
            <Text className="font-mono text-[12px] text-fg">
              {row.sleepText ?? t("insights.notLogged")}
            </Text>
          </View>
          <View className="flex-1 gap-1">
            <Bar fill={FOCUS_FILL} share={row.focusShare} />
            <Text className="font-mono text-[12px] text-fg">{row.focusText}</Text>
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
