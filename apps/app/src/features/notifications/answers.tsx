import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { type Answer, ANSWERS, isOwnSignIn, type PoolNotification } from "@pace/core";

/** One line of a notice, in the text colour or the quiet one. */
export const Line = ({
  children,
  tone = "fg",
}: {
  readonly children: string;
  readonly tone?: "fg" | "muted";
}) => (
  <Text
    className={tone === "fg" ? "font-sans text-[15px] text-fg" : "font-sans text-[13px] text-muted"}
  >
    {children}
  </Text>
);

/** Not me ends a session for good: the warning look, never the accent; else the first leads. */
const answerVariant = (answer: Answer, index: number): "danger" | "primary" | "secondary" => {
  if (answer === "revoked") {
    return "danger";
  }
  return index === 0 ? "primary" : "secondary";
};

/**
The answer buttons of an open notification; the answer stays pending until the server has it.
None on this session's own sign-in: only the person's other devices answer it (`isOwnSignIn`).
*/
export const Answers = ({
  item,
  ownSessionId,
}: {
  readonly item: PoolNotification;
  readonly ownSessionId: string | undefined;
}) => {
  const t = useT();
  const { feed } = useFeed();
  const [pending, setPending] = useState<Answer | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const focus = useConfirmFocus();
  if (item.resolution !== null) {
    // The answered button took focus with it: its status, which says the outcome, takes it on
    // (bug class 5). Next to it a neighbour's "Not me" would be one stray key from ending a session.
    return (
      <View accessible ref={focus.statusRef()} tabIndex={-1}>
        <Line tone="muted">{t(`notify.resolved.${item.resolution}`)}</Line>
      </View>
    );
  }
  const answers: readonly Answer[] = ANSWERS[item.kind];
  if (answers.length === 0 || isOwnSignIn(item, ownSessionId)) {
    return null;
  }
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap gap-2">
        {answers.map((answer, index) => (
          <Button
            busy={pending === answer}
            disabled={pending !== null}
            key={answer}
            onPress={() => {
              setPending(answer);
              setHasFailed(false);
              focus.toStatus();
              void (async () => {
                const isDone = await feed.resolve(item.id, answer);
                // Released once the store has the answer (or it was refused), never before.
                setPending(null);
                setHasFailed(!isDone);
                if (!isDone) {
                  // The buttons stay (the busy one takes its focus back): no status is coming.
                  focus.release();
                }
              })();
            }}
            variant={answerVariant(answer, index)}
          >
            {t(`notify.action.${answer}`)}
          </Button>
        ))}
      </View>
      {hasFailed ? <Line tone="muted">{t("notifications.failedAction")}</Line> : null}
    </View>
  );
};
