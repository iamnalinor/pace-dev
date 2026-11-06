import { View } from "react-native";

import type { ReviewRow as Row } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { ListRow } from "#app/ui/list-row.tsx";

/** What a decision's one-tap answers do, as buttons: the same under the row and in the details. */
export const ReviewAnswers = ({
  onDone,
  row,
}: {
  readonly row: Row;
  /** After an answer went through. */
  readonly onDone?: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <View className="flex-row flex-wrap gap-2">
      {row.actions.map((key) => (
        <Button
          key={key}
          onPress={() => {
            void (async () => {
              const result = await run(actions.runReviewAction(row.item, key));
              if (result.ok) {
                onDone?.();
              }
            })();
          }}
          size="small"
          variant="secondary"
        >
          {t(`review.action.${key}`)}
        </Button>
      ))}
    </View>
  );
};

/** The kind of decision and since when it waits: «Closed automatically — confirm? · since Mon 18:00». */
export const useReviewLine = (row: Row): string => {
  const t = useT();
  const viewer = useViewer();
  return [
    t(`review.kind.${row.kind}`),
    t("review.since", {
      when: zonedText({ at: row.since, mode: "datetime", tz: viewer.deviceTz }, viewer),
    }),
  ].join(" · ");
};

/**
One decision the rules want: its title (three lines at most), what it is and since when, and its
one-tap answers under it (they sit beside the row, which opens the details).
*/
export const ReviewRow = ({
  isSelected,
  onOpen,
  row,
}: {
  readonly row: Row;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
}) => {
  const line = useReviewLine(row);
  return (
    <View>
      <ListRow
        onPress={onOpen}
        selected={isSelected}
        subtitle={line}
        title={row.title}
        titleLines={3}
      />
      <View className="px-row-x pb-row-y">
        <ReviewAnswers row={row} />
      </View>
    </View>
  );
};
