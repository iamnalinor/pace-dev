import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { isFocusLost, moveFocus } from "#app/platform/move-focus.ts";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { Button } from "#app/ui/button.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { type Answer, ANSWERS, type PoolNotification } from "@pace/core";

/** One line of a notice, in the text colour or the quiet one. */
export const Line = ({
  children,
  tone = "fg",
}: {
  readonly children: string;
  readonly tone?: "fg" | "muted";
}) => (
  <Text
    className={
      tone === "fg"
        ? "font-sans text-callout text-label-primary"
        : "font-sans text-footnote text-label-secondary"
    }
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
Not me's confirm: it ends a session for good, with no undo, so it asks first (QA round 15 L11):
the question, then Cancel and End session side by side, Cancel first and focused.
*/
const NotMeConfirm = ({
  cancelRef,
  isBusy,
  onCancel,
  onEnd,
}: {
  readonly cancelRef: (node: null | View) => void;
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onEnd: () => void;
}) => {
  const t = useT();
  const question = t("notifications.notMeConfirm");
  return (
    <View aria-label={question} className="gap-2" role="group">
      <Text
        accessibilityLiveRegion="polite"
        className="font-sans text-subhead font-normal text-label-primary"
        role="status"
      >
        {question}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          disabled={isBusy}
          hotkey={HOTKEYS.escape}
          onPress={onCancel}
          ref={cancelRef}
          variant="secondary"
        >
          {t("common.cancel")}
        </Button>
        <Button busy={isBusy} onPress={onEnd} variant="danger">
          {t("notifications.notMeEnd")}
        </Button>
      </View>
    </View>
  );
};

/** The answer that settles the notice: it moves focus to the status that replaces the buttons. */
const useAnswer = (item: PoolNotification) => {
  const { feed } = useFeed();
  const [pending, setPending] = useState<Answer | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const focus = useConfirmFocus();
  const send = (answer: Answer): void => {
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
  };
  return { focus, hasFailed, pending, send };
};

/**
A settled notice's status. The answered button took focus with it: the status, which says the
outcome, takes it on (`statusRef`, bug class 5); next to it a neighbour's "Not me" would be one
stray key from ending a session. Without a `statusRef`, a Not me confirm was still open when the
notice settled (ended elsewhere, found by a reload): the status takes what the confirm left, then
`onTaken` closes it (fix round 1).
*/
const Settled = ({
  onTaken,
  statusRef,
  text,
}: {
  readonly onTaken: () => void;
  readonly statusRef: ((node: null | View) => void) | undefined;
  readonly text: string;
}) => (
  <View
    accessible
    ref={
      statusRef ??
      ((node: null | View) => {
        if (node === null) {
          return;
        }

        if (isFocusLost()) {
          moveFocus(node);
        }
        onTaken();
      })
    }
    tabIndex={-1}
  >
    <Line tone="muted">{text}</Line>
  </View>
);

/**
The answer buttons of an open notification; the answer stays pending until the server has it.
None on this session's own sign-in (`own`: only the person's other devices answer it), and a
sign-in whose session already ended elsewhere says so instead (`ended`). Not me asks first; the
feed keeps one such confirm open at a time (`isAsking`, `onAsking`), so Escape cancels the one in
view and no other.
*/
export const Answers = ({
  isAsking,
  item,
  onAsking,
  state,
}: {
  /** This notice's Not me confirm is the feed's open one. */
  readonly isAsking: boolean;
  readonly item: PoolNotification;
  /** Opens (true) or closes (false) this notice's confirm. */
  readonly onAsking: (isOpen: boolean) => void;
  readonly state: "ended" | "open" | "own";
}) => {
  const t = useT();
  const { focus, hasFailed, pending, send } = useAnswer(item);
  const resolution = item.resolution ?? (state === "ended" ? "revoked" : null);
  if (resolution !== null) {
    return (
      <Settled
        onTaken={() => {
          onAsking(false);
        }}
        statusRef={isAsking ? undefined : focus.statusRef()}
        text={t(`notify.resolved.${resolution}`)}
      />
    );
  }
  const answers: readonly Answer[] = ANSWERS[item.kind];
  if (state === "own" || answers.length === 0) {
    return null;
  }
  if (isAsking) {
    return (
      <View className="gap-2">
        <NotMeConfirm
          cancelRef={focus.cancelRef(t("notifications.notMeConfirm"))}
          isBusy={pending !== null}
          onCancel={() => {
            focus.toOpener("revoked");
            onAsking(false);
          }}
          onEnd={() => {
            send("revoked");
          }}
        />
        {hasFailed ? <Line tone="muted">{t("notifications.failedAction")}</Line> : null}
      </View>
    );
  }
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {answers.map((answer, index) => (
          <Button
            busy={pending === answer}
            disabled={pending !== null}
            key={answer}
            onPress={() => {
              if (answer === "revoked") {
                focus.toCancel();
                onAsking(true);
                return;
              }
              send(answer);
            }}
            ref={answer === "revoked" ? focus.openerRef("revoked") : undefined}
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
