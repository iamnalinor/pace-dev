import { Text, View } from "react-native";

import type { ReviewRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";

import { PushedScreen } from "./pushed-screen.tsx";

const RowView = ({ row }: { readonly row: ReviewRow }) => {
  const t = useT();
  const viewer = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="gap-2 rounded-xl border border-line bg-surface p-3.5">
      <Text className="font-sans text-[14px] font-medium text-fg">
        {t(`review.kind.${row.kind}`)}
      </Text>
      <Text className="font-sans text-[14px] text-fg2">{row.title}</Text>
      <Text className="font-sans text-[12px] text-muted">
        {t("review.since", {
          when: zonedText({ at: row.since, mode: "datetime", tz: viewer.deviceTz }, viewer),
        })}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {row.actions.map((key) => (
          <Button
            key={key}
            onPress={() => {
              void run(actions.runReviewAction(row.item, key));
            }}
            variant="secondary"
          >
            {t(`review.action.${key}`)}
          </Button>
        ))}
      </View>
    </View>
  );
};

/** "To sort": what the rules want a decision on, each with its one-tap answers. */
export const ReviewScreen = () => {
  const t = useT();
  const review = usePace().hooks.useReview();
  return (
    <PushedScreen title={t("review.title")}>
      {review.count === 0 ? <EmptyState>{t("review.empty")}</EmptyState> : null}
      <View className="gap-2.5 px-4">
        {review.items.map((row) => (
          <RowView key={row.taskId} row={row} />
        ))}
      </View>
    </PushedScreen>
  );
};
