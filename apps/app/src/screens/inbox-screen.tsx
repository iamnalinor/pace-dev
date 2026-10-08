import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";

import { CardView } from "./inbox-card.tsx";
import { PushedScreen } from "./pushed-screen.tsx";

/** The inbox: each capture verbatim with its guess, accepted or deleted with one tap. */
export const InboxScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const inbox = hooks.useInbox();
  return (
    <PushedScreen title={t("inbox.title")}>
      <Text className="mx-5 mb-3 font-sans text-[12px] text-muted">{t("inbox.hint")}</Text>
      {inbox.count === 0 ? <EmptyState>{t("inbox.empty")}</EmptyState> : null}
      <View aria-label={t("inbox.title")} className="gap-2.5 px-4" role="list">
        {inbox.cards.map((card) => (
          <CardView card={card} key={card.id} />
        ))}
      </View>
    </PushedScreen>
  );
};
