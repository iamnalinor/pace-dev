import { Text, View } from "react-native";

import type { ReviewRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";

/** One decision the rules want, with its one-tap answers (also on the Inbox). */
export const ReviewCard = ({ row }: { readonly row: ReviewRow }) => {
  const t = useT();
  const viewer = useViewer();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="gap-2 rounded-xl border border-separator bg-cell p-4">
      <Text className="font-sans text-subhead text-label-primary">
        {t(`review.kind.${row.kind}`)}
      </Text>
      <Text className="font-sans text-subhead font-normal text-label-secondary">{row.title}</Text>
      <Text className="font-sans text-caption font-normal text-label-tertiary">
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
