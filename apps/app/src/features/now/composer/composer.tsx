import { useState } from "react";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { ActionCards } from "#app/shared/assistant/action-cards.tsx";
import { ReadingIssueLine } from "#app/shared/assistant/reading-issue-line.tsx";
import { cx } from "#app/ui/cx.ts";
import { Presence } from "#app/ui/presence.tsx";

import { AiStatus } from "./ai-status.tsx";
import { type ComposerFlow, useComposerFlow } from "./composer-flow.tsx";
import { ComposerForm, type FormVariant } from "./composer-form.tsx";
import { formTitleKey } from "./form-title.ts";
import { QuickLine } from "./quick-line.tsx";

/** What the assistant made of the line, wherever the line or the form shows it. */
const Status = ({ flow }: { readonly flow: ComposerFlow }) => (
  <AiStatus onAnswer={flow.answer} onLater={() => void flow.readLater()} state={flow.ai.state} />
);

/** The composer's form over its shared state: in the line's card, or in Now's right pane. */
export const ComposerFlowForm = ({ variant }: { readonly variant: FormVariant }) => {
  const t = useT();
  const flow = useComposerFlow();
  return (
    <ComposerForm
      isTitleFocused
      model={flow.model}
      onAdd={() => void flow.add()}
      onClose={flow.close}
      onEdit={(next) => {
        flow.setEdits((current) => ({ ...current, ...next }));
      }}
      status={<Status flow={flow} />}
      subtaskDraft={{ onChange: flow.setSubtaskDraft, value: flow.subtaskDraft }}
      title={t(formTitleKey(flow.form ?? "by-hand"))}
      variant={variant}
    />
  );
};

/** Why the assistant's answer shows no card, with "Read it when it's back" offered once. */
const IssueLine = ({ flow }: { readonly flow: ComposerFlow }) =>
  flow.pending.issue === null ? null : (
    <ReadingIssueLine
      issue={flow.pending.issue}
      // Offered once, as on the cards: after a press the status line says what came of it.
      onLater={flow.ai.state.status === "idle" ? () => void flow.readLater() : undefined}
    />
  );

/** The line and, while the assistant works on it (and no form shows its reading), its status. */
const LineBlock = ({
  flow,
  isFocused,
  onFocusChange,
}: {
  readonly flow: ComposerFlow;
  readonly isFocused: boolean;
  readonly onFocusChange: (isInFocus: boolean) => void;
}) => (
  <>
    <QuickLine
      flow={flow}
      isFocused={isFocused}
      isLocked={flow.form !== null && flow.isFormInPane}
      isReading={flow.pending.busy}
      onFocusChange={onFocusChange}
    />
    {flow.pending.pending === null ? null : (
      // The preview fades in where it lands (spec §6 "assistant preview appears"): the card takes
      // its height at once, so Approve is never clipped while it grows (QA 22, bug-lessons 5).
      <Presence initial show>
        <ActionCards
          actions={flow.pending.pending.actions}
          busy={flow.pending.busy}
          onApprove={() => {
            void flow.pending.approve();
          }}
          onCancel={flow.dismiss}
          onFollowup={flow.pending.followup}
          // Offered once: after a press the status line below says what came of it.
          onLater={flow.ai.state.status === "idle" ? () => void flow.readLater() : undefined}
          questions={flow.pending.pending.questions}
          unread={flow.pending.pending.unread}
        />
      </Presence>
    )}
    <IssueLine flow={flow} />
    {flow.text.trim() === "" || flow.form !== null || flow.ai.state.status === "read" ? null : (
      <Status flow={flow} />
    )}
  </>
);

/**
Now's composer, one card. The line takes a task in words: Enter (or Send) has the assistant
read it into the task form, a second Enter adds it; + opens the form by hand (the line moves
into the title); Alt+Enter (or To Inbox) keeps the raw line in the Inbox. Nothing is sent to
the assistant while typing; a paste is read at once. On a phone the card unfolds into the form
in place; on a computer the form opens in the right pane and the line stays.
*/
export const Composer = ({ isFocused = false }: { readonly isFocused?: boolean }) => {
  const flow = useComposerFlow();
  const [isLineInFocus, setIsLineInFocus] = useState(false);
  const isFormHere = flow.form !== null && !flow.isFormInPane;
  const shape = isFormHere ? "form" : "line";
  // The line on arrival is simply there (F-MOT-07); a swap to the form and back fades in.
  const [swap, setSwap] = useState({ hasSwapped: false, shape });
  if (swap.shape !== shape) {
    setSwap({ hasSwapped: true, shape });
  }
  return (
    // One card that changes shape: its height is the line's or the form's, and the focused line
    // rings it in the quiet accent.
    <View
      className={cx(
        "mx-4 mb-3 rounded-xl border bg-cell px-1 py-1",
        isLineInFocus && !isFormHere ? "border-accent" : "border-outline",
      )}
      testID="composer-card"
    >
      {/*
      The card takes the new shape's height in the swap frame and the new content fades in
      (spec §6 composer unfold): nothing is ever clipped or drawn outside the card while it grows
      (F-MOT-08, bug-lessons 5). An opacity fade leaves the field in place to take the cursor.
      */}
      <Presence initial={swap.hasSwapped} key={shape} show>
        {isFormHere ? (
          <ComposerFlowForm variant="card" />
        ) : (
          <LineBlock flow={flow} isFocused={isFocused} onFocusChange={setIsLineInFocus} />
        )}
      </Presence>
    </View>
  );
};
