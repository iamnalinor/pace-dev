import {
  addMinutesIso,
  endOfDayIn,
  expectedInstances,
  type Importance,
  type PresetsState,
  type ProgressMode,
  type ProjectColorName,
  type QueryContext,
  type ResolvedPreset,
  resolvePreset,
  zonesDiffer,
} from "@pace/core";

import type { MetaPart } from "./now.ts";
import type { PresetDraft } from "./preset-draft.ts";

import { relativeDay } from "./relative-day.ts";

const PREVIEW_ID = "preview";
const MINUTES_PER_DAY = 24 * 60;
/** The sample task is 40 % done where the pace expects 60 %. */
export const PREVIEW_SAMPLE = { progress: 0.4, solved: 2, total: 5 } as const;

/** A sample task of the draft, drawn like a Now row. */
export type PresetPreviewModel = {
  readonly color: ProjectColorName;
  readonly importance: Importance;
  readonly progressMode: ProgressMode;
  readonly meta: readonly MetaPart[];
};

/**
The draft among the other presets, so the real resolver and scheduler can read it: a default
preset is replaced in place, a new or own preset joins under a preview id.
*/
const withDraft = (
  presets: PresetsState,
  draft: PresetDraft,
  now: string,
): { readonly state: PresetsState; readonly id: string } => {
  const current = presets.byId[draft.id];
  if (current !== undefined && draft.extends === null) {
    return {
      id: draft.id,
      state: {
        byId: { ...presets.byId, [draft.id]: { ...current, definition: draft.definition } },
      },
    };
  }
  const preview = {
    archived: false,
    builtIn: false,
    createdAt: now,
    definition: draft.definition,
    extends: draft.extends,
    id: PREVIEW_ID,
    name: draft.name,
    order: 0,
  };
  return { id: PREVIEW_ID, state: { byId: { ...presets.byId, [PREVIEW_ID]: preview } } };
};

const progressParts = (resolved: ResolvedPreset): readonly MetaPart[] => {
  switch (resolved.progressMode) {
    case "none":
    case "slider": {
      return [];
    }
    case "subtasks": {
      return [{ kind: "solved", solved: PREVIEW_SAMPLE.solved, total: PREVIEW_SAMPLE.total }];
    }
  }
};

/** The next instance's due for a recurring preset, else tomorrow's end of day. */
const previewDue = (
  presets: PresetsState,
  presetId: string,
  { now, zone }: PreviewContext,
): { readonly at: string; readonly tz: string } => {
  const slot = expectedInstances(presets, now).find(
    (candidate) => candidate.presetId === presetId && Date.parse(candidate.dueAt) > Date.parse(now),
  );
  return slot === undefined
    ? { at: endOfDayIn(addMinutesIso(now, MINUTES_PER_DAY), zone), tz: zone }
    : { at: slot.dueAt, tz: slot.dueTz };
};

/** The clock, plus the zone a due without a schedule ends its day in (the account's). */
export type PreviewContext = QueryContext & { readonly zone: string };

/** The editor's sample row; `null` while the draft's chain does not resolve. */
export const presetPreview = (
  presets: PresetsState,
  draft: PresetDraft,
  ctx: PreviewContext,
): null | PresetPreviewModel => {
  const preview = withDraft(presets, draft, ctx.now);
  const resolved = resolvePreset(preview.state, preview.id);
  if (!resolved.ok) {
    return null;
  }
  const due = previewDue(preview.state, preview.id, ctx);
  const { color, defaultImportance: importance, progressMode } = resolved.value;
  return {
    color,
    importance,
    meta: [
      { importance, kind: "importance" } as const,
      {
        ...due,
        kind: "due",
        relative: relativeDay(due.at, ctx),
        zoneDiffers: zonesDiffer(due, { at: due.at, tz: ctx.deviceTz }),
      },
      ...progressParts(resolved.value),
    ],
    progressMode,
  };
};
