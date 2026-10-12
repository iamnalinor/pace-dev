import { Text, View } from "react-native";

import type { ReviewRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";

/**
The decisions to show beside the Inbox's captures: a capture unsorted for too long is the
capture's own card there, not a second line.
*/
export const decisionsOf = (rows: readonly ReviewRow[]): readonly ReviewRow[] =>
  rows.filter((row) => row.kind !== "unsorted-too-long");

/** One decision the rules want, with its one-tap answers (also on the Inbox). */
export const ReviewCard = ({ row }: { readonly row: ReviewRow }) => {
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
