import { ChevronDown, Inbox, Sparkles } from "lucide-react";
import { type SyntheticEvent, useEffect, useId, useRef, useState } from "react";

import type { AiReading, ComposerEdits, ComposerModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { type AiRead, useAiRead, useAutoAiRead, useReadFirst } from "@pace/client/react";

import { AiStatus } from "./ai-status.tsx";
import { ComposerChips } from "./composer-chips.tsx";
import { ExpandedFields } from "./expanded-fields.tsx";
import { useComposerSubmit } from "./use-composer-submit.ts";

/** The `n` shortcut and `/add` focus the line by this id. */
export const COMPOSER_INPUT_ID = "composer-input";

type Props = {
  readonly initialText?: string | undefined;
  readonly isInitiallyExpanded?: boolean | undefined;
  readonly className?: string | undefined;
};

type Draft = {
  readonly text: string;
  readonly edits: ComposerEdits;
  readonly description: string;
  readonly subtasks: string;
};

const emptyDraft = (text = ""): Draft => ({ description: "", edits: {}, subtasks: "", text });

type LineProps = {
  readonly model: ComposerModel;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  /** `/add` and "New task" land with the cursor in the line. */
  readonly shouldFocus: boolean;
  readonly isReading: boolean;
  readonly onAi: () => void;
};

/** "Read with AI": the assistant fills the same chips; the icon pulses while it reads. */
const AiButton = ({
  isDisabled,
  isReading,
  onAi,
}: {
  readonly isDisabled: boolean;
  readonly isReading: boolean;
  readonly onAi: () => void;
}) => {
  const t = useT();
  return (
    <Button
      aria-label={t(isReading ? "composer.aiReading" : "composer.ai")}
      disabled={isDisabled || isReading}
      onClick={onAi}
      size="icon-sm"
      title={t("composer.ai")}
      variant="ghost"
    >
      <Sparkles aria-hidden="true" className={cn("size-4", isReading && "animate-pulse")} />
    </Button>
  );
};

const ComposerLine = ({
  isExpanded,
  isReading,
  model,
  onAi,
  onText,
  onToggle,
  shouldFocus,
  text,
}: LineProps) => {
  const t = useT();
  const hintId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (shouldFocus) {
      inputRef.current?.focus();
    }
  }, [shouldFocus]);
  return (
    <div className="flex items-start gap-1.5">
      <label className="sr-only" htmlFor={COMPOSER_INPUT_ID}>
        {t("composer.label")}
      </label>
      <textarea
        aria-describedby={hintId}
        autoComplete="off"
        // Grows with the text (a pasted homework stays readable), up to about eight lines.
        className="field-sizing-content max-h-48 min-h-10 min-w-0 flex-1 resize-none bg-transparent p-2 text-[15px]/6 text-fg outline-none placeholder:text-muted"
        id={COMPOSER_INPUT_ID}
        onChange={(event) => {
          onText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
          // Enter adds, Shift+Enter breaks the line.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }

          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder={t("composer.placeholder")}
        ref={inputRef}
        rows={1}
        value={text}
      />
      <span className="sr-only" id={hintId}>
        {t("composer.hint")}
      </span>
      <AiButton isDisabled={model.isEmpty} isReading={isReading} onAi={onAi} />
      <Button
        aria-expanded={isExpanded}
        aria-label={t(isExpanded ? "composer.collapse" : "composer.expand")}
        onClick={onToggle}
        size="icon-sm"
        variant="ghost"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", isExpanded && "rotate-180")}
        />
      </Button>
      <Button
        className="max-w-[45%]"
        disabled={model.isEmpty}
        size="sm"
        type="submit"
        variant="accent"
      >
        <span className="truncate">
          {model.target.kind === "instance"
            ? t("composer.addTo", { title: model.target.title })
            : t("composer.add")}
        </span>
      </Button>
    </div>
  );
};

const ToInbox = ({ onPress }: { readonly onPress: () => void }) => {
  const t = useT();
  return (
    <div className="flex justify-end px-1">
      <Button onClick={onPress} size="sm" variant="ghost">
        <Inbox aria-hidden="true" className="size-4" />
        {t("composer.toInbox")}
      </Button>
    </div>
  );
};

/** The line, the chip taps and the assistant's reading, kept consistent with each other. */
const useComposerDraft = (initialText: string | undefined, ai: AiRead) => {
  const [draft, setDraft] = useState(() => emptyDraft(initialText));
  const patch = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  return {
    draft,
    /** The assistant's chips go over the taps so far. */
    onReading: (reading: AiReading): void => {
      setDraft((current) => ({ ...current, edits: { ...current.edits, ...reading.edits } }));
    },
    /** New text makes the assistant's reading stale: its title and problems give way to the rules. */
    onText: (text: string): void => {
      const { projectName: _name, subtasks: _subtasks, title: _title, ...edits } = draft.edits;
      patch(ai.state.status === "read" ? { edits, text } : { text });
      ai.reset();
    },
    patch,
    reset: (): void => {
      setDraft(emptyDraft());
      ai.reset();
    },
  };
};

/**
The one entry point: type a line, see what it was read as (category, importance, project,
due, estimate, link, problems), fix any chip with one tap, Enter adds. "To Inbox" keeps the
raw line for later; "More" opens a description and a list of subtasks.
*/
export const Composer = ({ className, initialText, isInitiallyExpanded = false }: Props) => {
  const t = useT();
  const { assistant, hooks } = useServices();
  const ai = useAiRead(assistant);
  const { draft, onReading, onText, patch, reset } = useComposerDraft(initialText, ai);
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);
  const model = hooks.useComposer({ edits: draft.edits, text: draft.text });
  const submit = useComposerSubmit(reset);
  useAutoAiRead(ai, draft.text, onReading);
  const readFirst = useReadFirst(ai, (text) => submit.sendToInbox(text, t("composer.aiSlow")));
  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (readFirst.isPending(draft.text, onReading)) {
      return;
    }
    const extras = { description: draft.description, subtasks: draft.subtasks.split("\n") };
    void submit.addTask(model, extras);
  };
  return (
    <section
      aria-label={t("composer.label")}
      className={cn("rounded-lg border border-line bg-surface p-2", className)}
    >
      <form className="grid gap-2" onSubmit={onSubmit}>
        <ComposerLine
          isExpanded={isExpanded}
          isReading={ai.state.status === "reading"}
          model={model}
          onAi={() => {
            void ai.read(draft.text, onReading);
          }}
          onText={onText}
          onToggle={() => {
            setIsExpanded((current) => !current);
          }}
          shouldFocus={isInitiallyExpanded}
          text={draft.text}
        />
        <AiStatus
          isWaiting={readFirst.isWaiting}
          onAnswer={(answer) => {
            onText(`${draft.text.trimEnd()} ${answer}`);
          }}
          state={ai.state}
        />
        {!model.isEmpty && (
          <ComposerChips
            model={model}
            onEdit={(edits) => {
              patch({ edits: { ...draft.edits, ...edits } });
            }}
          />
        )}
        {isExpanded && (
          <ExpandedFields
            description={draft.description}
            onChange={patch}
            subtasks={draft.subtasks}
          />
        )}
        {!model.isEmpty && (
          <ToInbox
            onPress={() => {
              void submit.sendToInbox(draft.text);
            }}
          />
        )}
      </form>
    </section>
  );
};
