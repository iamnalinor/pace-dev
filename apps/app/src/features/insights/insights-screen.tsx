import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import type { InsightBar, InsightsModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { PROJECT_FILL } from "#app/ui/color.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { formatDuration, formatWeekRange } from "@pace/core";

import { Card } from "./card.tsx";
import { Patterns } from "./patterns.tsx";

const MIN_PERCENT = 2;

const barWidth = (share: number): `${number}%` =>
  `${Math.max(MIN_PERCENT, Math.round(share * 100))}%`;

/**
One measure per chart, one row per entity: the name and the value are text (color is never
the only label), the bar is the entity's own color, anchored at zero with rounded ends.
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
            <Text className="w-24 font-sans text-[12px] text-fg2" numberOfLines={1}>
              {name}
            </Text>
            <View className="h-2.5 flex-1 overflow-hidden rounded-r bg-track">
              <View
                className={`h-full rounded-r ${bar.color === null ? "bg-faint" : PROJECT_FILL[bar.color]}`}
                style={{ width: barWidth(bar.share) }}
              />
            </View>
            <Text className="font-mono text-[12px] text-fg">{value}</Text>
          </View>
        );
      })}
    </Card>
  );
};

const Row = ({ name, value }: { readonly name: string; readonly value: string }) => (
  <View className="flex-row justify-between gap-3">
    <Text className="flex-1 font-sans text-[12px] text-fg2" numberOfLines={1}>
      {name}
    </Text>
    <Text className="font-mono text-[12px] text-fg">{value}</Text>
  </View>
);

/** Previous and next week (none past this one). */
const WeekNav = ({
  onWeek,
  week,
}: {
  readonly week: InsightsModel;
  readonly onWeek: (weekOf: null | string) => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon={ChevronLeft}
        label={t("insights.previous")}
        onPress={() => {
          onWeek(week.previous);
        }}
        variant="plain"
      />
      <IconButton
        disabled={week.next === null}
        icon={ChevronRight}
        label={t("insights.next")}
        onPress={() => {
          onWeek(week.next);
        }}
        variant="plain"
      />
    </View>
  );
};

/** One week of the ledger: where the time went, what got done on time, plan against fact. */
export const InsightsScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const { deviceTz, language } = useViewer();
  const [weekOf, setWeekOf] = useState<null | string>(null);
  const week = hooks.useInsights(weekOf);
  const header = (
    <ScreenHeader
      eyebrow={formatWeekRange(week.weekStart, week.zone, language)}
      right={<WeekNav onWeek={setWeekOf} week={week} />}
      title={t("insights.title")}
    />
  );
  return (
    <Screen header={header}>
      <View className="gap-3 px-5">
        {week.totalMinutes > 0 ? (
          <>
            <Text className="font-sans text-[14px] text-fg">
              {t("insights.total", { duration: formatDuration(week.totalMinutes, language) })}
            </Text>
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
          <Text className="font-sans text-[14px] text-muted">{t("insights.nothing")}</Text>
        )}
        {week.onTime.length > 0 ? (
          <Card title={t("insights.onTime")}>
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
          <Card title={t("insights.estimates")}>
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
    </Screen>
  );
};
