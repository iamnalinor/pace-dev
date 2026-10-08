import { useId, useState } from "react";

import type { ComposerEdits, ComposerModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { isHttpUrl } from "@pace/core";

import type { ComposerField } from "./field-chips.tsx";

type Props = {
  readonly model: ComposerModel;
  readonly onEdit: (edits: ComposerEdits) => void;
};

const NONE = "none";

const INPUT =
  "h-9 w-full rounded-md border border-line bg-bg px-3 font-mono text-[13px] text-fg outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40";

const ProjectEditor = ({ model, onEdit }: Props) => {
  const t = useT();
  return (
    <ChipGroup
      label={t("composer.project")}
      onChange={(value) => {
        onEdit({ projectId: value === NONE ? null : value });
      }}
      options={[
        { label: t("composer.noProject"), value: NONE },
        ...model.projects.map((project) => ({
          color: project.color,
          label: project.name,
          value: project.id,
        })),
      ]}
      value={model.project?.id ?? NONE}
    />
  );
};

const DueEditor = ({ model, onEdit }: Props) => {
  const t = useT();
  const id = useId();
  const { clock, hooks } = useServices();
  const zone = model.due?.tz ?? hooks.useSettings().timezone ?? clock.deviceTz;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={id}>
        {t("composer.due")}
      </label>
      <input
        className={`${INPUT} w-auto`}
        id={id}
        onChange={(event) => {
          const at = wallClockToIso(event.target.value, zone);
          onEdit({ due: at === null ? null : { at, tz: zone } });
        }}
        type="datetime-local"
        value={model.due === null ? "" : isoToWallClock(model.due.at, zone)}
      />
      <span className="font-mono text-xs text-muted">{t("add.dueZone", { tz: zone })}</span>
      {model.due !== null && (
        <Button
          onClick={() => {
            onEdit({ due: null });
          }}
          size="sm"
          variant="ghost"
        >
          {t("composer.noDue")}
        </Button>
      )}
    </div>
  );
};

const EstimateEditor = ({ model, onEdit }: Props) => {
  const t = useT();
  const language = useLanguage();
  const buckets = useServices().actions.estimateHints(model.preset.id);
  return (
    <ChipGroup
      label={t("composer.estimate")}
      onChange={(value) => {
        onEdit({ estimateMinutes: value === NONE ? null : Number(value) });
      }}
      options={[
        { label: t("composer.noEstimate"), value: NONE },
        ...buckets.map((bucket) => ({
          label: formatMinutes(bucket.minutes, language),
          value: String(bucket.minutes),
        })),
      ]}
      value={model.estimateMinutes === null ? NONE : String(model.estimateMinutes)}
    />
  );
};

const LinkEditor = ({ model, onEdit }: Props) => {
  const t = useT();
  const id = useId();
  // Typed locally: a half-typed address is not a link yet.
  const [draft, setDraft] = useState(model.link?.url ?? "");
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={id}>
        {t("composer.link")}
      </label>
      <input
        className={INPUT}
        id={id}
        inputMode="url"
        onChange={(event) => {
          const url = event.target.value.trim();
          setDraft(event.target.value);
          if (url === "" || isHttpUrl(url)) {
            onEdit({ link: url === "" ? null : url });
          }
        }}
        placeholder="https://"
        type="url"
        value={draft}
      />
    </div>
  );
};

const EDITORS = {
  due: DueEditor,
  estimate: EstimateEditor,
  link: LinkEditor,
  project: ProjectEditor,
} as const satisfies Readonly<Record<ComposerField, (props: Props) => React.ReactNode>>;

/** The choices for the chip that was tapped, right under the chips. */
export const FieldEditor = ({ field, ...props }: Props & { readonly field: ComposerField }) => {
  const Editor = EDITORS[field];
  return (
    <div className="rounded-md bg-raised/60 p-2">
      <Editor {...props} />
    </div>
  );
};
