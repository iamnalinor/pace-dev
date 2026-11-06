import { useState } from "react";
import { View } from "react-native";

import type { InsightBar } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { DestinationScreen } from "#app/screens/destination-screen.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { WeekPeriod } from "#app/shared/week-period.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { fillClass } from "#app/ui/hue.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { Text } from "#app/ui/text.tsx";
import { formatDuration, formatWeekRange } from "@pace/core";

import { Card } from "./card.tsx";
import { Patterns } from "./patterns.tsx";
import { useValueColumn } from "./value-column.ts";

const MIN_PERCENT = 2;

const barWidth = (share: number): `${number}%` =>
  `${Math.max(MIN_PERCENT, Math.round(share * 100))}%`;

/**
One measure per chart, one row per entity: the name and the value are text (color is never
the only label), the bar is the entity's own color, anchored at zero with rounded ends. The
values share one column as wide as the widest, so the bars end on the same x (F-LAY-14).
*/
const Bars = ({
  bars,
  nameOf,
  title,
}: {
  readonly bars: readonly InsightBar[];
  readonly title: string;
  readonly nameOf: (bar: InsightBar) => string;
}) => {
  const { language } = useViewer();
  const column = useValueColumn();
  return (
    <Card title={title}>
      {bars.map((bar) => {
        const name = nameOf(bar);
        const value = formatDuration(bar.minutes, language);
        return (
          <View
            accessibilityLabel={`${name}: ${value}`}
            className="flex-row items-center gap-3"
            key={bar.key ?? "none"}
            role="group"
          >
            <View className="w-24">
              <Text policy="truncate" role="footnote" tone="secondary">
                {name}
              </Text>
            </View>
            <View className="h-3 flex-1 overflow-hidden rounded-r-xs bg-fill-2">
              <View
                className={`h-full rounded-r-xs ${bar.color === null ? "bg-hue-slate-stroke" : fillClass(bar.color)}`}
                style={{ width: barWidth(bar.share) }}
                testID="insight-bar"
              />
            </View>
            <View onLayout={column.onLayout} style={column.style}>
              <Text className="text-right" numeric role="footnote">
                {value}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
};

/** A table row: the name (one line, cut at its end) and the value trailing, tabular. */
const Row = ({ name, value }: { readonly name: string; readonly value: string }) => (
  <ListRow
    title={name}
    titleLines={1}
    trailing={
      <Text numeric role="footnote">
        {value}
      </Text>
    }
  />
);

/** One week of the ledger: where the time went, what got done on time, plan against fact. */
export const InsightsScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const { deviceTz, language } = useViewer();
  const [weekOf, setWeekOf] = useState<null | string>(null);
  const week = hooks.useInsights(weekOf);
  return (
    <DestinationScreen
      period={
        <WeekPeriod
          isAway={week.next !== null}
          label={formatWeekRange(week.weekStart, week.zone, language)}
          next={week.next}
          onWeek={setWeekOf}
          previous={week.previous}
        />
      }
      scrollLabel={t("insights.body", { title: t("insights.title") })}
      title={t("insights.title")}
    >
      <View>
        {week.totalMinutes > 0 ? (
          <>
            <View className="mx-gutter mt-2 px-row-x">
              <Text role="headline">
                {t("insights.total", { duration: formatDuration(week.totalMinutes, language) })}
              </Text>
            </View>
            <Bars
              bars={week.byCategory}
              nameOf={(bar) => t(`category.${bar.key ?? "other"}` as "category.other")}
              title={t("insights.byCategory")}
            />
            <Bars
              bars={week.byProject}
              nameOf={(bar) => bar.name ?? t("insights.noProject")}
              title={t("insights.byProject")}
            />
            <Patterns week={week} zone={deviceTz} />
          </>
        ) : (
          <EmptyState title={t("insights.nothing")} />
        )}
        {week.onTime.length > 0 ? (
          <Card isTable title={t("insights.onTime")}>
            {week.onTime.map((row) => (
              <Row
                key={row.projectId ?? "none"}
                name={row.name ?? t("insights.noProject")}
                value={t("insights.onTimeRow", { onTime: row.onTime, total: row.total })}
              />
            ))}
          </Card>
        ) : null}
        {week.estimates.length > 0 ? (
          <Card isTable title={t("insights.estimates")}>
            {week.estimates.map((row) => (
              <Row
                key={row.taskId}
                name={row.title}
                value={t("insights.estimateRow", {
                  estimate: formatDuration(row.estimateMinutes, language),
                  tracked: formatDuration(row.trackedMinutes, language),
                })}
              />
            ))}
          </Card>
        ) : null}
      </View>
    </DestinationScreen>
  );
};
