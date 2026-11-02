import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { ActionCards } from "#app/shared/assistant/action-cards.tsx";
import { AnimatedHeight } from "#app/ui/animated-height.tsx";
import { cx } from "#app/ui/cx.ts";

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

/** The line and, while the assistant works on it (and no form shows its reading), its status. */
const LineBlock = ({
  flow,
  isFocused,
  onFocusChange,
}: {
  readonly flow: ComposerFlow;
  readonly isFocused: boolean;
  readonly onFocusChange: (isInFocus: boolean) => void;
}) => {
  const t = useT();
  return (
    <>
      <QuickLine
        flow={flow}
        isFocused={isFocused}
        isLocked={flow.form !== null && flow.isFormInPane}
        isReading={flow.pending.busy}
        onFocusChange={onFocusChange}
      />
      {flow.pending.pending === null ? null : (
        <ActionCards
          actions={flow.pending.pending.actions}
          busy={flow.pending.busy}
          onApprove={() => {
            void flow.pending.approve();
          }}
          onCancel={flow.dismiss}
          onFollowup={flow.pending.followup}
          questions={flow.pending.pending.questions}
          source={flow.pending.pending.status}
        />
      )}
      {flow.pending.issue === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-footnote text-danger">
          {t(flow.pending.issue)}
        </Text>
      )}
      {flow.text.trim() === "" || flow.form !== null || flow.ai.state.status === "read" ? null : (
        <Status flow={flow} />
      )}
    </>
  );
};

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
  return (
    // One card that changes shape: its height follows the line or the form, and the focused
    // line rings it in the quiet accent.
    <View
      className={cx(
        "mx-4 mb-3 rounded-xl border bg-cell px-1 py-1",
        isLineInFocus && !isFormHere ? "border-accent" : "border-outline",
      )}
    >
      <AnimatedHeight>
        {/* No entering animation here: it would keep the field from taking the cursor. */}
        <View key={isFormHere ? "form" : "line"}>
          {isFormHere ? (
            <ComposerFlowForm variant="card" />
          ) : (
            <LineBlock flow={flow} isFocused={isFocused} onFocusChange={setIsLineInFocus} />
          )}
        </View>
      </AnimatedHeight>
    </View>
  );
};
