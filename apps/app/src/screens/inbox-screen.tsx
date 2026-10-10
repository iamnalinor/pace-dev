import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";

import { CardView } from "./inbox-card.tsx";
import { PushedScreen } from "./pushed-screen.tsx";
import { decisionsOf, ReviewCard } from "./review-screen.tsx";

/**
The one place for what waits on the person: the decisions the rules want ("To sort") first,
then each capture verbatim with its guess, accepted or deleted with one tap.
*/
export const InboxScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const inbox = hooks.useInbox();
  const decisions = decisionsOf(hooks.useReview().items);
  return (
    <PushedScreen title={t("inbox.title")}>
      <Text className="mx-5 mb-3 font-sans text-[12px] text-muted">{t("inbox.hint")}</Text>
      {inbox.count + decisions.length === 0 ? <EmptyState>{t("inbox.empty")}</EmptyState> : null}
      {decisions.length === 0 ? null : (
        <View aria-label={t("review.title")} className="mb-4 gap-2.5 px-4" role="list">
          <Text
            accessibilityRole="header"
            className="px-1 font-sans text-[11px] uppercase tracking-[0.06em] text-muted"
          >
            {t("review.title")}
          </Text>
          {decisions.map((row) => (
            <ReviewCard key={row.taskId} row={row} />
          ))}
        </View>
      )}
      <View aria-label={t("inbox.title")} className="gap-2.5 px-4" role="list">
        {inbox.cards.map((card) => (
          <CardView card={card} key={card.id} />
        ))}
      </View>
    </PushedScreen>
  );
};
