import { type SyntheticEvent, useId } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";
import {
  type ButtonForm,
  buttonFormOf,
  buttonSaveOf,
  type EditorProps,
  type FormPartProps,
  withCategory,
} from "@pace/client";
import { useDraft } from "@pace/client/react";

import { CategoryChips, MonoField } from "./fields.tsx";

export type { EditorTarget } from "@pace/client";

type Draft = ButtonForm;

/** Category, Expect, Limit and the linked task: what an activity started from the button gets. */
const DefaultsFields = ({ draft, patch }: FormPartProps<Draft>) => {
  const t = useT();
  const tasks = useServices().hooks.useNow().rows;
  return (
    <>
      <CategoryChips
        onChange={(category) => {
          patch(withCategory(draft, category));
        }}
        value={draft.category}
      />
      <div className="grid grid-cols-2 gap-3">
        <MonoField
          hint={t("editor.expectHint")}
          label={t("editor.expect")}
          onChange={(expect) => {
            patch({ expect });
          }}
          type="number"
          value={draft.expect}
        />
        <MonoField
          hint={t("editor.limitHint")}
          label={t("editor.limit")}
          onChange={(limit) => {
            patch({ limit });
          }}
          type="number"
          value={draft.limit}
        />
      </div>
      <label className="grid gap-1 text-xs text-muted">
        {t("editor.task")}
        <select
          className="h-10 rounded-md border border-line bg-surface px-2 text-sm text-fg"
          onChange={(event) => {
            patch({ taskId: event.target.value });
          }}
          value={draft.taskId}
        >
          <option value="">{t("editor.noTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
      </label>
    </>
  );
};

/** Remove (for an existing button), Cancel and Save. */
const EditorActions = ({ onClose, target }: EditorProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  return (
    <div className="flex flex-wrap justify-between gap-2">
      {target.kind === "edit" ? (
        <Button
          onClick={() => {
            void (async () => {
              if ((await run(actions.removeButton(target.button.id))) !== null) {
                onClose();
              }
            })();
          }}
          type="button"
          variant="ghost"
        >
          {t("editor.remove")}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button onClick={onClose} type="button" variant="outline">
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="accent">
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
};

/** The sheet behind "press and hold": a button's name, category, Expect, Limit and task. */
export const ButtonEditor = ({ onClose, target }: EditorProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => buttonFormOf(target));
  const labelId = useId();
  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const { buttonId, draft: button } = buttonSaveOf(target, draft);
    if ((await run(actions.saveButton(buttonId, button))) !== null) {
      onClose();
    }
  };
  return (
    <Sheet
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      open
    >
      <SheetContent closeLabel={t("common.close")}>
        <SheetHeader>
          <SheetTitle>{t(target.kind === "edit" ? "editor.title" : "editor.newTitle")}</SheetTitle>
          <SheetDescription>{t("time.buttonHint")}</SheetDescription>
        </SheetHeader>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="grid gap-1 text-xs text-muted" htmlFor={labelId}>
            {t("editor.label")}
            <input
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-fg"
              id={labelId}
              maxLength={80}
              onChange={(event) => {
                patch({ label: event.target.value });
              }}
              value={draft.label}
            />
          </label>
          <DefaultsFields draft={draft} patch={patch} />
          <EditorActions onClose={onClose} target={target} />
        </form>
      </SheetContent>
    </Sheet>
  );
};
