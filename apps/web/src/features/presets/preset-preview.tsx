import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMeta } from "#web/shared/format/meta.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { ColorBar } from "#web/shared/ui/color-tag.tsx";
import { PaceBar } from "#web/shared/ui/pace-bar.tsx";
import { type MetaPart, relativeDay } from "@pace/client";
import {
  addMinutesIso,
  endOfDayIn,
  expectedInstances,
  type PresetsState,
  type ResolvedPreset,
  resolvePreset,
  zonesDiffer,
} from "@pace/core";

import type { PresetDraft } from "./preset-draft.ts";

const PREVIEW_ID = "preview";
const MINUTES_PER_DAY = 24 * 60;
/** The sample task is 40 % done where the pace expects 60 %. */
const SAMPLE = { expected: 0.6, progress: 0.4, solved: 2, total: 5 } as const;
const PERCENT = 100;

/** The draft as a preset among the others, so the real resolver and scheduler can read it. */
const withDraft = (presets: PresetsState, draft: PresetDraft, now: string): PresetsState => ({
  byId: {
    ...presets.byId,
    [PREVIEW_ID]: {
      archived: false,
      builtIn: false,
      createdAt: now,
      definition: draft.definition,
      extends: draft.extends,
      id: PREVIEW_ID,
      name: draft.name,
    },
  },
});

const progressParts = (resolved: ResolvedPreset): readonly MetaPart[] => {
  switch (resolved.progressMode) {
    case "none": {
      return [];
    }
    case "slider": {
      return [
        { kind: "behind-pace", percent: Math.round((SAMPLE.expected - SAMPLE.progress) * PERCENT) },
      ];
    }
    case "subtasks": {
      return [{ kind: "solved", solved: SAMPLE.solved, total: SAMPLE.total }];
    }
  }
};

/** The next instance's due for a recurring preset, else tomorrow's end of day. */
const previewDue = (
  presets: Parameters<typeof expectedInstances>[0],
  now: string,
  zone: string,
): { readonly at: string; readonly tz: string } => {
  const slot = expectedInstances(presets, now).find(
    (candidate) =>
      candidate.presetId === PREVIEW_ID && Date.parse(candidate.dueAt) > Date.parse(now),
  );
  return slot === undefined
    ? { at: endOfDayIn(addMinutesIso(now, MINUTES_PER_DAY), zone), tz: zone }
    : { at: slot.dueAt, tz: slot.dueTz };
};

/** A sample task of this preset drawn like a Now row: its color, importance, due and progress. */
export const PresetPreview = ({ draft }: { readonly draft: PresetDraft }) => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const presets = hooks.useAppState((state) => state.presets);
  const { timezone } = hooks.useSettings();
  const ctx = hooks.useClock();
  const previewPresets = withDraft(presets, draft, ctx.now);
  const resolved = resolvePreset(previewPresets, PREVIEW_ID);
  if (!resolved.ok) {
    return null;
  }
  const due = previewDue(previewPresets, ctx.now, timezone ?? ctx.deviceTz);
  const { defaultImportance: importance, progressMode } = resolved.value;
  const meta: readonly MetaPart[] = [
    ...(importance === "normal" ? [] : [{ importance, kind: "importance" } as const]),
    {
      ...due,
      kind: "due",
      relative: relativeDay(due.at, ctx),
      zoneDiffers: zonesDiffer(due, { at: due.at, tz: ctx.deviceTz }),
    },
    ...progressParts(resolved.value),
  ];
  return (
    <section
      aria-label={t("presets.preview")}
      className="mx-4 mt-3 rounded-xl border border-dashed border-line p-3"
    >
      <p className="mb-2 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
        {t("presets.preview")}
      </p>
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-px size-[22px] shrink-0 rounded-full border-[1.5px] border-muted"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="flex items-center gap-2">
            <ColorBar className="h-4" color={resolved.value.color} />
            <span
              className={cn(
                "truncate text-[15px] font-medium",
                importance === "nice_to_have" && "font-normal",
              )}
            >
              {draft.name.trim() === "" ? t("presets.sampleTitle") : `${draft.name} 1`}
            </span>
          </span>
          <p className="text-xs text-muted">
            {formatMeta(meta, { deviceTz: ctx.deviceTz, language, now: ctx.now }).map(
              (segment, index) => (
                <span
                  className={cn(
                    segment.tone === "warn" && "text-warn",
                    segment.tone === "strong" && "font-medium text-fg",
                  )}
                  key={segment.text}
                >
                  {index > 0 && " · "}
                  {segment.text}
                </span>
              ),
            )}
          </p>
          {progressMode !== "none" && <PaceBar pace={SAMPLE.expected} value={SAMPLE.progress} />}
        </div>
      </div>
    </section>
  );
};
