import {
  AlignLeft,
  ArrowUp,
  Ban,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CloudOff,
  Coffee,
  Ellipsis,
  ExternalLink,
  Folder,
  Globe,
  History,
  House,
  Inbox,
  Laptop,
  MapPin,
  Moon,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Smartphone,
  Square,
  SquareTerminal,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react-native";

import { type ColorRole, size as SIZE } from "@pace/core";

import { hueOf, type TagColor } from "./hue.ts";
import { useTheme } from "./theme-provider.tsx";

/**
The icons the app draws, by name: the only import of lucide (lint: `pace/kit-primitives`), so
every icon has the kit's sizes and stroke. A new icon is added here.
*/
const ICONS = {
  "align-left": AlignLeft,
  "arrow-up": ArrowUp,
  ban: Ban,
  bell: Bell,
  "calendar-clock": CalendarClock,
  "calendar-days": CalendarDays,
  "calendar-range": CalendarRange,
  "chart-column": ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  "cloud-off": CloudOff,
  coffee: Coffee,
  ellipsis: Ellipsis,
  "external-link": ExternalLink,
  folder: Folder,
  globe: Globe,
  history: History,
  house: House,
  inbox: Inbox,
  laptop: Laptop,
  "map-pin": MapPin,
  moon: Moon,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plug: Plug,
  plus: Plus,
  "refresh-cw": RefreshCw,
  repeat: Repeat,
  search: Search,
  settings: Settings,
  smartphone: Smartphone,
  square: Square,
  "square-terminal": SquareTerminal,
  timer: Timer,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  user: User,
  users: Users,
  video: Video,
  x: X,
  zap: Zap,
} as const;

/** An icon of the kit, by lucide's own name. */
export type IconName = keyof typeof ICONS;

/**
The three icon sizes (spec §3.6): `inline` 16 in meta lines, `control` 20 in buttons, rows, the
sidebar and fields, `bar` 24 in the tab bar and app-bar actions.
*/
export type IconSize = keyof typeof SIZE.icon;

/**
An icon's colour by its job (spec §3.6): `secondary` by default, `primary` when it is a control's
only label, `accent` only for the primary action, `onAccent` on an accent fill, `quaternary` for a disabled control's
icon, `inverse` (the page's ground) on a filled mark (a ticked check), and the statuses.
*/
export type IconTone =
  | "accent"
  | "danger"
  | "inverse"
  | "onAccent"
  | "primary"
  | "quaternary"
  | "secondary"
  | "tertiary"
  | "warn";

const TONE_ROLE: Readonly<Record<IconTone, ColorRole>> = {
  accent: "accent.text",
  danger: "status.danger",
  inverse: "bg.app",
  onAccent: "accent.on",
  primary: "label.primary",
  quaternary: "label.quaternary",
  secondary: "label.secondary",
  tertiary: "label.tertiary",
  warn: "status.warn",
};

/** lucide's viewBox: a stroke is drawn in its units, so it scales with the icon unless adjusted. */
const VIEW_BOX = 24;

export type IconProps = {
  readonly name: IconName;
  readonly size?: IconSize | undefined;
  readonly tone?: IconTone | undefined;
  /** Drawn in a hue's ink instead of a tone (a coloured tile: `HueTile`). */
  readonly hue?: TagColor | undefined;
  /** Filled in its tone (the selected tab on Android; spec §3.6). */
  readonly filled?: boolean | undefined;
  /** What a screen reader says for it; without one the icon is hidden (its control is named). */
  readonly label?: string | undefined;
};

/**
Every icon the app draws (spec §3.6, §4.1.1): one of three sizes, a stroke of `size.stroke` (1.75)
on screen at every size, so a 16 and a 24 draw the same line. That is what lucide's deprecated
`absoluteStrokeWidth` did; its replacement (`nonScalingStroke`) leans on SVG's `vector-effect`, so
the viewBox stroke is worked out here instead. Hidden from assistive technology unless it carries
a `label` (F-A11Y-19).
*/
export const Icon = ({
  filled = false,
  hue,
  label,
  name,
  size = "control",
  tone = "secondary",
}: IconProps) => {
  const { palette } = useTheme();
  const Glyph = ICONS[name];
  const role: ColorRole = hue === undefined ? TONE_ROLE[tone] : `hue.${hueOf(hue)}.ink`;
  const color = palette[role];
  const pixels = SIZE.icon[size];
  return (
    <Glyph
      color={color}
      size={pixels}
      strokeWidth={(SIZE.stroke * VIEW_BOX) / pixels}
      {...(filled && { fill: color })}
      // lucide hides an icon unless it carries an `aria-*` or `role` prop.
      {...(label === undefined
        ? { "aria-hidden": true }
        : { "aria-label": label, accessible: true, role: "img" })}
    />
  );
};
