import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { reviewDecisions, waitingCount } from "@pace/client";

import { CardView } from "./inbox-card.tsx";
import { ReviewCard } from "./review-card.tsx";

/**
The one place for what waits on the person (a tab on a phone, a sidebar row beside it): the decisions the rules want ("To sort") first,
then each capture verbatim with its guess, accepted or deleted with one tap.
*/
export const InboxScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const inbox = hooks.useInbox();
  const review = hooks.useReview();
  const decisions = reviewDecisions(review);
  return (
    <Screen header={<ScreenHeader title={t("inbox.title")} />}>
      <Text className="mx-5 mb-3 font-sans text-caption font-normal text-label-tertiary">
        {t("inbox.hint")}
      </Text>
      {waitingCount(inbox, review) === 0 ? <EmptyState>{t("inbox.empty")}</EmptyState> : null}
      {decisions.length === 0 ? null : (
        <View aria-label={t("review.title")} className="mb-4 gap-3 px-4" role="list">
          <Text
            accessibilityRole="header"
            className="px-1 font-sans text-caption2 font-normal uppercase text-label-tertiary"
          >
            {t("review.title")}
          </Text>
          {decisions.map((row) => (
            <ReviewCard key={row.taskId} row={row} />
          ))}
        </View>
      )}
      <View aria-label={t("inbox.title")} className="gap-3 px-4" role="list">
        {inbox.cards.map((card) => (
          <CardView card={card} key={card.id} />
        ))}
      </View>
    </Screen>
  );
};
