import { useRef } from "react";
import { type TextInput, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { ActionCards } from "#app/shared/assistant/action-cards.tsx";
import { ReadingIssueLine } from "#app/shared/assistant/reading-issue-line.tsx";
import { usePendingActions } from "#app/shared/assistant/use-pending-actions.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { Text } from "#app/ui/text.tsx";
import { useDraft } from "#app/ui/use-draft.ts";

/** What the typed field keeps while the bar folds: the text and the proposal being read. */
export const useTypedStart = (text: string, setText: (text: string) => void) => {
  const pending = usePendingActions("activity", () => {
    setText("");
  });
  // The line's unsent words survive a reload (feedback 5 item 7); approved, the line empties.
  useDraft("time.line", text, setText);
  return { pending, text };
};

type Typed = ReturnType<typeof useTypedStart>;

type Pending = Typed["pending"];

/**
The assistant's proposal for the typed line: above the field on a computer; on a phone a sheet,
since above the field it pushed the fixed bar past its budget and the tiles covered it (spec §5.1,
design review B2).
*/
const TypedProposal = ({
  onCancel,
  onUse,
  pending,
}: {
  readonly onCancel: () => void;
  readonly onUse: () => void;
  readonly pending: Pending;
}) => {
  const t = useT();
  const isWide = useIsWide();
  const cards = (proposal: NonNullable<Pending["pending"]>) => (
    <ActionCards
      actions={proposal.actions}
      busy={pending.busy}
      onApprove={() => {
        onUse();
        void pending.approve();
      }}
      onCancel={onCancel}
      onFollowup={pending.followup}
      questions={proposal.questions}
      unread={proposal.unread}
    />
  );
  if (isWide) {
    return pending.pending === null ? null : cards(pending.pending);
  }
  return (
    <OverlayPresence value={pending.pending}>
      {(proposal) => (
        <Sheet
          closeLabel={t("common.close")}
          name="time-proposal"
          onClose={onCancel}
          open={pending.pending !== null}
          title={t("assistant.review")}
        >
          {cards(proposal)}
        </Sheet>
      )}
    </OverlayPresence>
  );
};

/**
"What are you doing?" first reads actions; the owner approves before anything is written. While the
assistant reads, the field is a draft: a dashed outline, and the reading is said once.
*/
export const TypedStart = ({
  onUse,
  setText,
  typed: { pending, text },
}: {
  readonly onUse: () => void;
  readonly setText: (text: string) => void;
  readonly typed: Typed;
}) => {
  const t = useT();
  const fieldRef = useRef<TextInput>(null);
  const trimmed = text.trim();
  const start = (): void => {
    onUse();
    if (pending.pending !== null) {
      void pending.approve();
      // Reading already: Enter again would only send the same request twice.
    } else if (trimmed !== "" && !pending.busy) {
      pending.submit(trimmed);
    }
  };
  const cancel = (): void => {
    // The proposal goes; the cursor goes back to the field that opened it.
    pending.cancel();
    fieldRef.current?.focus();
  };
  return (
    <View className="gap-2">
      <TypedProposal onCancel={cancel} onUse={onUse} pending={pending} />
      {pending.busy && pending.pending === null ? (
        <Text accessibilityLiveRegion="polite" role="footnote" tone="secondary">
          {t("assistant.reading")}
        </Text>
      ) : null}
      {pending.issue === null ? null : <ReadingIssueLine issue={pending.issue} />}
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <TextField
            isDraft={pending.busy || pending.pending !== null}
            isLabelHidden
            label={t("time.whatDoing")}
            maxLength={200}
            onChangeText={(next) => {
              onUse();
              pending.discard();
              setText(next);
            }}
            onSubmitEditing={start}
            placeholder={t("time.whatDoing")}
            purpose="text"
            ref={fieldRef}
            returnKeyType="go"
            value={text}
          />
        </View>
        {/* The line's start: the assistant reads it first, so it is named "see the actions". */}
        <IconButton
          disabled={trimmed === "" || pending.busy}
          icon="play"
          label={t("assistant.review")}
          onPress={start}
        />
      </View>
    </View>
  );
};
