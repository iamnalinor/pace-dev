import type { TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { type Translate, useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { cn } from "#web/shared/lib/cn.ts";

import type { EditError, EditForm } from "./edit-form.ts";

export const INPUT =
  "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-faint aria-[invalid=true]:border-warn";
export const LABEL = "flex flex-col gap-1.5 text-xs text-muted";

const ERROR_KEYS = {
  dueInvalid: "edit.dueInvalid",
  dueRequired: "edit.dueRequired",
  startInvalid: "edit.startInvalid",
  startRequired: "edit.startRequired",
  titleRequired: "edit.titleRequired",
  zoneInvalid: "edit.zoneInvalid",
} as const satisfies Readonly<Record<EditError, string>>;

export const FieldError = ({
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

type PartProps = {
  readonly form: EditForm;
  readonly set: <K extends keyof EditForm>(key: K, value: EditForm[K]) => void;
  readonly errors: readonly EditError[];
};

const invalidChecker =
  (errors: readonly EditError[]) =>
  (which: readonly EditError[]): boolean =>
    errors.some((error) => which.includes(error));

/** Due and start in one zone, which the form always names. */
export const ScheduleFields = ({ errors, form, set }: PartProps) => {
  const t = useT();
  const isInvalid = invalidChecker(errors);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-xs text-muted">{t("edit.inZone", { zone: form.zone })}</legend>
      <label className={LABEL}>
        {t("edit.due")}
        <input
          aria-describedby="edit-due-error"
          aria-invalid={isInvalid(["dueInvalid", "dueRequired"])}
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
          aria-invalid={isInvalid(["startInvalid", "startRequired"])}
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
          aria-invalid={isInvalid(["zoneInvalid"])}
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
  );
};

/** The estimate as buckets, the preset's default first. */
export const EstimateField = ({
  form,
  set,
  view,
}: Omit<PartProps, "errors"> & { readonly view: TaskViewModel }) => {
  const t = useT();
  const language = useLanguage();
  const { actions } = useServices();
  const buckets = actions.estimateHints(form.presetId);
  const presetDefault = view.overrideSheet.isEstimateOwn
    ? null
    : view.overrideSheet.estimateMinutes;
  return (
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
  );
};

export const LinkFields = ({ form, set }: Omit<PartProps, "errors">) => {
  const t = useT();
  return (
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
  );
};

/** The task's own words: title and description. */
export const TextFields = ({ errors, form, set }: PartProps) => {
  const t = useT();
  const isInvalid = invalidChecker(errors);
  return (
    <>
      <label className={LABEL}>
        {t("edit.taskTitle")}
        <input
          aria-describedby="edit-title-error"
          aria-invalid={isInvalid(["titleRequired"])}
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
    </>
  );
};
