// The types of tokens.json (v2). No runtime code.

export type ThemeName = "dark" | "light";

/** The twelve hues of the family on an OKLCH wheel, plus the neutral `slate`. */
export type HueName =
  | "amber"
  | "blue"
  | "cyan"
  | "green"
  | "indigo"
  | "lime"
  | "orange"
  | "pink"
  | "red"
  | "slate"
  | "teal"
  | "violet"
  | "yellow";

export type HueColors = {
  /** Text on `tint`. */
  readonly ink: string;
  /** Lines, dots and chart marks (at least 3:1 on `bg.app`). */
  readonly stroke: string;
  /** A translucent wash (`rgba()`), composited over the layer below. */
  readonly tint: string;
};

export type ColorScheme = {
  readonly accent: {
    readonly default: string;
    readonly on: string;
    readonly pressed: string;
    readonly text: string;
  };
  readonly accentQuiet: string;
  readonly bg: {
    readonly app: string;
    readonly cell: string;
    readonly elevated: string;
    readonly inset: string;
    readonly sidebar: string;
  };
  readonly dangerQuiet: string;
  readonly fill: { readonly 1: string; readonly 2: string; readonly 3: string; readonly 4: string };
  readonly focus: string;
  readonly grid: string;
  readonly label: {
    readonly primary: string;
    readonly quaternary: string;
    readonly secondary: string;
    readonly tertiary: string;
  };
  readonly logo: string;
  readonly outline: string;
  readonly scrim: string;
  readonly selection: string;
  readonly separator: { readonly default: string; readonly opaque: string };
  readonly shadow: { readonly card: string; readonly overlay: string };
  readonly status: {
    readonly danger: string;
    readonly question: string;
    readonly success: string;
    readonly warn: string;
  };
  readonly warnQuiet: string;
};

export type TypeRole =
  | "body"
  | "callout"
  | "caption2"
  | "caption"
  | "footnote"
  | "headline"
  | "largeTitle"
  | "numeric.live"
  | "numeric.stat"
  | "numeric.value"
  | "subhead"
  | "title1"
  | "title2";

/** One type role at one size class: px/dp, weight, tracking in em. */
export type TypeStyle = {
  readonly line: number;
  readonly size: number;
  /** Letter spacing in em (negative tightens). */
  readonly tracking: number;
  readonly weight: number;
};

export type TypeSize = "desktop" | "phone";

export type Responsive = { readonly desktop: number; readonly phone: number };

export type TokensV2 = {
  readonly color: Readonly<Record<ThemeName, ColorScheme>>;
  readonly font: {
    readonly features: { readonly numeric: readonly string[] };
    readonly sans: string;
    readonly weights: readonly number[];
  };
  readonly hue: Readonly<Record<ThemeName, Readonly<Record<HueName, HueColors>>>>;
  readonly layout: {
    readonly breakpoint: { readonly expanded: number; readonly medium: number };
    readonly cellGap: Responsive;
    readonly contentMax: number;
    readonly contentMaxWide: number;
    readonly dialog: number;
    readonly gutter: Responsive;
    readonly gutterPane: number;
    readonly headerBottom: Responsive;
    readonly headerTop: Responsive;
    readonly inspectorMax: number;
    readonly inspectorMin: number;
    readonly inspectorWidth: number;
    readonly navBar: number;
    readonly popover: number;
    readonly popoverMax: number;
    readonly popoverMin: number;
    readonly rail: number;
    readonly rowGap: Responsive;
    readonly rowPadX: Responsive;
    readonly rowPadY: Responsive;
    readonly sectionGap: Responsive;
    readonly sheetPad: Responsive;
    readonly sidebarWidth: number;
  };
  readonly motion: {
    readonly duration: Readonly<Record<MotionStep, number>>;
    readonly easing: {
      readonly enter: Bezier;
      readonly exit: Bezier;
      readonly move: Bezier;
    };
    readonly exit: Readonly<Record<MotionStep, number>>;
    readonly reduced: { readonly fade: number };
    readonly spring: {
      readonly sheet: {
        readonly damping: number;
        readonly mass: number;
        readonly stiffness: number;
      };
      readonly thumb: { readonly damping: number; readonly stiffness: number };
    };
  };
  readonly radius: Readonly<Record<RadiusStep, number>>;
  readonly size: {
    /** The sign-in and consent cards' width (login, app link, OAuth). */
    readonly authCard: number;
    readonly chip: { readonly max: number };
    readonly hit: number;
    readonly hitWeb: number;
    readonly icon: { readonly bar: number; readonly control: number; readonly inline: number };
    /** A centred message's line length (the crash and incompatible-server screens). */
    readonly message: number;
    /** A narrow page column: Now's list beside the form, onboarding on the web. */
    readonly narrowColumn: number;
    readonly row: { readonly compact: number; readonly min: number };
    readonly stroke: number;
    readonly switch: {
      readonly knob: { readonly off: number; readonly on: number };
      readonly track: { readonly height: number; readonly width: number };
    };
    readonly toast: { readonly max: number };
    readonly tooltip: { readonly max: number };
  };
  readonly space: Readonly<Record<SpaceStep, number>>;
  readonly type: Readonly<
    Record<TypeRole, Readonly<Record<TypeSize, TypeStyle>> & { readonly tabular?: boolean }>
  >;
  readonly version: number;
  readonly z: {
    readonly overlay: number;
    readonly sticky: number;
    readonly tooltip: number;
    readonly toast: number;
  };
};

export type MotionStep = "lg" | "md" | "sm" | "xs";

/** A cubic-bezier easing as `[x1, y1, x2, y2]` (JSON arrays cannot be typed as tuples). */
export type Bezier = readonly number[];

/** The 4-pt spacing scale, steps `0`…`11` (px/dp). */
export type SpaceStep = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11";

export type RadiusStep = "lg" | "md" | "pill" | "sheet" | "sm" | "xl" | "xs";

export type HueRole = `hue.${HueName}.${keyof HueColors}`;

/** Every colour role of the system: `bg.*`, `label.*`, `accent*`, `status.*`, `fill.*`, `hue.<name>.*`… */
export type ColorRole =
  | "accent"
  | "accent.on"
  | "accent.pressed"
  | "accent.text"
  | "accentQuiet"
  | "bg.app"
  | "bg.cell"
  | "bg.elevated"
  | "bg.inset"
  | "bg.sidebar"
  | "dangerQuiet"
  | "fill.1"
  | "fill.2"
  | "fill.3"
  | "fill.4"
  | "focus"
  | "grid"
  | "label.primary"
  | "label.quaternary"
  | "label.secondary"
  | "label.tertiary"
  | "logo"
  | "outline"
  | "scrim"
  | "selection"
  | "separator"
  | "separator.opaque"
  | "status.danger"
  | "status.question"
  | "status.success"
  | "status.warn"
  | "warnQuiet"
  | HueRole;

/** The ten stored project colour names (the event schema is not widened by the overhaul). */
export type ProjectColorName =
  | "amber"
  | "blue"
  | "coral"
  | "green"
  | "orange"
  | "pink"
  | "slate"
  | "teal"
  | "violet"
  | "yellow";
