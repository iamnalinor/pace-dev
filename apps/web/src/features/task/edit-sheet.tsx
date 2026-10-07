import { useState } from "react";

import type { ActionResult, TaskViewModel } from "@pace/client";
import type { Event } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { type Translate, useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { revokeEvents, showUndoToast } from "#web/shared/lib/undo-toast.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { CategoryChips } from "#web/shared/ui/category-chips.tsx";
import { ImportanceChips } from "#web/shared/ui/importance-chips.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";

import { editChanges, type EditError, type EditForm, initialEditForm } from "./edit-form.ts";

const INPUT =
  "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-faint aria-[invalid=true]:border-warn";
const LABEL = "flex flex-col gap-1.5 text-xs text-muted";

const ERROR_KEYS = {
  dueInvalid: "edit.dueInvalid",
  dueRequired: "edit.dueRequired",
  startInvalid: "edit.startInvalid",
  startRequired: "edit.startRequired",
  titleRequired: "edit.titleRequired",
  zoneInvalid: "edit.zoneInvalid",
} as const satisfies Readonly<Record<EditError, string>>;

const FieldError = ({
  errors,
  id,
  t,
  which,
}: {
  readonly errors: readonly EditError[];
  readonly which: readonly EditError[];
  readonly id: string;
  readonly t: Translate;
}) => {
  const shown = errors.filter((error) => which.includes(error));
  return shown.length === 0 ? null : (
    <span className="text-xs text-warn" id={id} role="alert">
      {shown.map((error) => t(ERROR_KEYS[error])).join(" ")}
    </span>
  );
};

type FormProps = {
  readonly view: TaskViewModel;
  readonly onDone: () => void;
};

type Step = () => ActionResult;
type Run = ReturnType<typeof useRunAction>;

/** Runs the steps one after another (each is validated against what the previous left). */
const runInOrder = async (steps: readonly Step[], run: Run): Promise<null | readonly Event[]> => {
  const [first, ...rest] = steps;
  if (first === undefined) {
    return [];
  }
  const events = await run(first());
  if (events === null) {
    return null;
  }
  const later = await runInOrder(rest, run);
  return later === null ? null : [...events, ...later];
};

/** Writes the sheet in the order the core expects: preset first, then the task, then its scores. */
const useSave = (view: TaskViewModel) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  return async (changes: ReturnType<typeof editChanges>): Promise<boolean> => {
    if (!changes.ok) {
      return false;
    }
    const { estimate, importance, patch, presetId } = changes.value;
    const written = await runInOrder(
      [
        ...(presetId === undefined ? [] : [() => actions.setPreset(view.id, presetId)]),
        ...(Object.keys(patch).length === 0 ? [] : [() => actions.updateTask(view.id, patch)]),
        ...(importance === undefined ? [] : [() => actions.setImportance(view.id, importance)]),
        ...(estimate === undefined ? [] : [() => actions.setEstimate(view.id, estimate)]),
      ],
      run,
    );
    if (written === null) {
      return false;
    }
    if (written.length > 0) {
      showUndoToast({
        message: t("edit.saved"),
        onUndo: () => {
          void revokeEvents(actions.revoke, written);
        },
        undoLabel: t("common.undo"),
      });
    }
    return true;
  };
};

const EditFields = ({ onDone, view }: FormProps) => {
  const t = useT();
  const language = useLanguage();
  const { actions, hooks } = useServices();
  const { deviceTz } = hooks.useClock();
  const settings = hooks.useSettings();
  const [initial] = useState(() => initialEditForm(view, settings.timezone ?? deviceTz));
  const [form, setForm] = useState<EditForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const save = useSave(view);
  const changes = editChanges(view, initial, form);
  const errors = showErrors && !changes.ok ? changes.error : [];
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const buckets = actions.estimateHints(form.presetId);
  const presetDefault = view.overrideSheet.isEstimateOwn
    ? null
    : view.overrideSheet.estimateMinutes;
  const invalid = (which: readonly EditError[]): boolean =>
    errors.some((error) => which.includes(error));

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setShowErrors(true);
        void (async () => {
          if (await save(changes)) {
            onDone();
          }
        })();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-xs text-muted">
          {t("edit.preset")}
        </span>
        <CategoryChips
          onChange={(presetId, defaultImportance) => {
            setForm((current) => ({ ...current, importance: defaultImportance, presetId }));
          }}
          value={form.presetId}
        />
      </div>
      <label className={LABEL}>
        {t("edit.taskTitle")}
        <input
          aria-describedby="edit-title-error"
          aria-invalid={invalid(["titleRequired"])}
          className={INPUT}
          onChange={(event) => {
            set("title", event.target.value);
          }}
          value={form.title}
        />
        <FieldError errors={errors} id="edit-title-error" t={t} which={["titleRequired"]} />
      </label>
      <label className={LABEL}>
        {t("edit.description")}
        <textarea
          className={cn(INPUT, "h-auto min-h-20 py-2")}
          onChange={(event) => {
            set("description", event.target.value);
          }}
          value={form.description}
        />
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-xs text-muted">
          {t("edit.inZone", { zone: form.zone })}
        </legend>
        <label className={LABEL}>
          {t("edit.due")}
          <input
            aria-describedby="edit-due-error"
            aria-invalid={invalid(["dueInvalid", "dueRequired"])}
            className={cn(INPUT, "font-mono")}
            onChange={(event) => {
              set("due", event.target.value);
            }}
            type="datetime-local"
            value={form.due}
          />
          <FieldError
            errors={errors}
            id="edit-due-error"
            t={t}
            which={["dueInvalid", "dueRequired"]}
          />
        </label>
        <label className={LABEL}>
          {t("edit.start")}
          <input
            aria-describedby="edit-start-error"
            aria-invalid={invalid(["startInvalid", "startRequired"])}
            className={cn(INPUT, "font-mono")}
            onChange={(event) => {
              set("start", event.target.value);
            }}
            type="datetime-local"
            value={form.start}
          />
          <FieldError
            errors={errors}
            id="edit-start-error"
            t={t}
            which={["startInvalid", "startRequired"]}
          />
        </label>
        <label className={LABEL}>
          {t("edit.zone")}
          <input
            aria-describedby="edit-zone-error"
            aria-invalid={invalid(["zoneInvalid"])}
            autoCapitalize="off"
            className={cn(INPUT, "font-mono")}
            onChange={(event) => {
              set("zone", event.target.value);
            }}
            spellCheck={false}
            value={form.zone}
          />
          <FieldError errors={errors} id="edit-zone-error" t={t} which={["zoneInvalid"]} />
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-xs text-muted">
          {t("edit.importance")}
        </span>
        <ImportanceChips
          onChange={(value) => {
            set("importance", value);
          }}
          value={form.importance}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-muted">{t("edit.estimate")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[{ minutes: null, samples: [] }, ...buckets].map((bucket) => {
            const isOn = form.estimate === bucket.minutes;
            const label =
              bucket.minutes === null
                ? t("edit.estimateDefault", {
                    duration: formatMinutes(
                      presetDefault ?? view.overrideSheet.estimateMinutes,
                      language,
                    ),
                  })
                : formatMinutes(bucket.minutes, language);
            return (
              <button
                aria-pressed={isOn}
                className={cn(
                  "flex h-9 items-center rounded-pill border px-3 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
                  isOn
                    ? "border-inverse bg-inverse font-medium text-inverseFg"
                    : "border-line text-fg2",
                )}
                key={bucket.minutes ?? "default"}
                onClick={() => {
                  set("estimate", bucket.minutes);
                }}
                title={bucket.samples.map((sample) => sample.title).join(", ")}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          {t("edit.link")}
          <input
            className={INPUT}
            onChange={(event) => {
              set("link", event.target.value);
            }}
            value={form.link}
          />
        </label>
        <label className={LABEL}>
          {t("edit.submitVia")}
          <input
            className={INPUT}
            onChange={(event) => {
              set("submitVia", event.target.value);
            }}
            value={form.submitVia}
          />
        </label>
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="h-[50px] flex-1 rounded-lg" variant="secondary">
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button className="h-[50px] flex-2 rounded-lg font-semibold" type="submit" variant="accent">
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
};

type Props = {
  readonly view: TaskViewModel;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

/** The override sheet: preset, title, schedule (always with its zone), importance, estimate, fields. */
export const EditSheet = ({ isOpen, onOpenChange, view }: Props) => {
  const t = useT();
  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t("edit.title")}</SheetTitle>
        </SheetHeader>
        <EditFields
          onDone={() => {
            onOpenChange(false);
          }}
          view={view}
        />
      </SheetContent>
    </Sheet>
  );
};
