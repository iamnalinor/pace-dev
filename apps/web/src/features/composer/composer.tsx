import { ChevronDown, Inbox } from "lucide-react";
import { type SyntheticEvent, useId, useState } from "react";

import type { ComposerEdits, ComposerModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";

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
};

const ComposerLine = ({ isExpanded, model, onText, onToggle, text }: LineProps) => {
  const t = useT();
  const hintId = useId();
  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={COMPOSER_INPUT_ID}>
        {t("composer.label")}
      </label>
      <input
        aria-describedby={hintId}
        autoComplete="off"
        className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-fg outline-none placeholder:text-faint"
        id={COMPOSER_INPUT_ID}
        onChange={(event) => {
          onText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        placeholder={t("composer.placeholder")}
        value={text}
      />
      <span className="sr-only" id={hintId}>
        {t("composer.hint")}
      </span>
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

/**
The one entry point: type a line, see what it was read as (category, importance, project,
due, estimate, link, problems), fix any chip with one tap, Enter adds. "To Inbox" keeps the
raw line for later; "More" opens a description and a list of subtasks.
*/
export const Composer = ({ className, initialText, isInitiallyExpanded = false }: Props) => {
  const t = useT();
  const { hooks } = useServices();
  const [draft, setDraft] = useState(() => emptyDraft(initialText));
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);
  const model = hooks.useComposer({ edits: draft.edits, text: draft.text });
  const submit = useComposerSubmit(() => {
    setDraft(emptyDraft());
  });
  const patch = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
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
          model={model}
          onText={(text) => {
            patch({ text });
          }}
          onToggle={() => {
            setIsExpanded((current) => !current);
          }}
          text={draft.text}
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
          <div className="flex justify-end px-1">
            <Button
              onClick={() => {
                void submit.sendToInbox(draft.text);
              }}
              size="sm"
              variant="ghost"
            >
              <Inbox aria-hidden="true" className="size-4" />
              {t("composer.toInbox")}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
};
