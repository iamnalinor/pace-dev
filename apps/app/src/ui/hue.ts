import {
  type HueName,
  type Importance,
  type ProjectColorName,
  projectHue,
  type TaskStatus,
} from "@pace/core";

/**
A colour a tag, chip or mark is drawn in: a hue of the family, or a project's stored colour name
(`coral` is drawn in the red hue).
*/
export type TagColor = HueName | ProjectColorName;

/** The hue a colour is drawn in: a project's stored `coral` is the red hue (bug-lessons 13). */
export const hueOf = (color: TagColor): HueName => (color === "coral" ? projectHue(color) : color);

/*
The hue helpers (spec §4.2.7; `ui/tag.tsx` draws the tag and the dot with them). Static class names: NativeWind only compiles the classes it can read in the source. A coloured
thing is a tag: the hue's tint under text in its ink, which the token contrast test keeps legible in
both themes; lines, dots and bars use the hue's stroke (≥ 3:1 on the grounds).
*/
/** A solid mark in the hue (dots, bars, swatches). */
const STROKE_FILL: Readonly<Record<HueName, string>> = {
  amber: "bg-hue-amber-stroke",
  blue: "bg-hue-blue-stroke",
  cyan: "bg-hue-cyan-stroke",
  green: "bg-hue-green-stroke",
  indigo: "bg-hue-indigo-stroke",
  lime: "bg-hue-lime-stroke",
  orange: "bg-hue-orange-stroke",
  pink: "bg-hue-pink-stroke",
  red: "bg-hue-red-stroke",
  slate: "bg-hue-slate-stroke",
  teal: "bg-hue-teal-stroke",
  violet: "bg-hue-violet-stroke",
  yellow: "bg-hue-yellow-stroke",
};

/** The hue's wash, behind a tag's text. */
const TINT: Readonly<Record<HueName, string>> = {
  amber: "bg-hue-amber-tint",
  blue: "bg-hue-blue-tint",
  cyan: "bg-hue-cyan-tint",
  green: "bg-hue-green-tint",
  indigo: "bg-hue-indigo-tint",
  lime: "bg-hue-lime-tint",
  orange: "bg-hue-orange-tint",
  pink: "bg-hue-pink-tint",
  red: "bg-hue-red-tint",
  slate: "bg-hue-slate-tint",
  teal: "bg-hue-teal-tint",
  violet: "bg-hue-violet-tint",
  yellow: "bg-hue-yellow-tint",
};

/** A chip's or a button's outline in the hue. */
const STROKE_EDGE: Readonly<Record<HueName, string>> = {
  amber: "border-hue-amber-stroke",
  blue: "border-hue-blue-stroke",
  cyan: "border-hue-cyan-stroke",
  green: "border-hue-green-stroke",
  indigo: "border-hue-indigo-stroke",
  lime: "border-hue-lime-stroke",
  orange: "border-hue-orange-stroke",
  pink: "border-hue-pink-stroke",
  red: "border-hue-red-stroke",
  slate: "border-hue-slate-stroke",
  teal: "border-hue-teal-stroke",
  violet: "border-hue-violet-stroke",
  yellow: "border-hue-yellow-stroke",
};

/** Text on the hue's tint (or on the page). */
const INK: Readonly<Record<HueName, string>> = {
  amber: "text-hue-amber-ink",
  blue: "text-hue-blue-ink",
  cyan: "text-hue-cyan-ink",
  green: "text-hue-green-ink",
  indigo: "text-hue-indigo-ink",
  lime: "text-hue-lime-ink",
  orange: "text-hue-orange-ink",
  pink: "text-hue-pink-ink",
  red: "text-hue-red-ink",
  slate: "text-hue-slate-ink",
  teal: "text-hue-teal-ink",
  violet: "text-hue-violet-ink",
  yellow: "text-hue-yellow-ink",
};

/** Each importance's tag colour: red for ASAP, warm for Prioritized, green for Normal, cool for Nice-to-have. */
export const IMPORTANCE_HUES: Readonly<Record<Importance, HueName>> = {
  asap: "red",
  nice_to_have: "slate",
  normal: "green",
  prioritized: "amber",
};

/** A task status's tag colour: work under way in violet (the blue is the accent's); the rest neutral. */
export const STATUS_HUES: Readonly<Record<TaskStatus, HueName | null>> = {
  in_progress: "violet",
  not_started: null,
  paused: null,
};

/** A solid mark in the colour: a dot, a bar, a swatch. */
export const fillClass = (color: TagColor): string => STROKE_FILL[hueOf(color)];

/** An outline in the colour: an unselected chip, a time-bar button. */
export const outlineClass = (color: TagColor): string => STROKE_EDGE[hueOf(color)];

/** The colour's wash: a selected chip, a tag. */
export const tintClass = (color: TagColor): string => TINT[hueOf(color)];

/** The text colour on a wash; neutral without a colour. */
export const inkClass = (color: null | TagColor): string =>
  color === null ? "text-label-secondary" : INK[hueOf(color)];
