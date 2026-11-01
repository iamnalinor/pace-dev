import type { ProjectColorName } from "../design/token-types.ts";
import type { Language } from "../i18n/language.ts";
import type { ActivityCategory } from "../tracking/model.ts";

/** The four data sets the gallery shows. */
export const GALLERY_SETS = ["demo", "worst", "empty", "one"] as const;
export type GallerySet = (typeof GALLERY_SETS)[number];

export type GalleryImportance = "asap" | "nice_to_have" | "normal" | "prioritized";

export type GalleryProject = {
  readonly id: string;
  readonly name: string;
  readonly color: ProjectColorName;
};

export type GalleryTask = {
  readonly id: string;
  readonly title: string;
  /** The project the task belongs to; `null` shows its category instead. */
  readonly projectId: null | string;
  readonly importance: GalleryImportance;
  /** A Nice-to-have without a deadline is shown quietly. */
  readonly isDimmed: boolean;
  readonly isRepeating: boolean;
  readonly subtasksLeft: number;
  /** Minutes left to the deadline, when it has one (up to 23 h 59 m). */
  readonly leftMinutes: null | number;
};

export type GallerySubtask = {
  readonly id: string;
  /** `null` for an item with no number (`7a Bonus`): its label stands in for the number. */
  readonly number: null | number;
  readonly label: string;
  readonly isSolved: boolean;
};

export type GalleryRunning = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly minutes: number;
  readonly expectMinutes: null | number;
};

export type GalleryBlock = {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  /** The day of the week, 0 for Monday. */
  readonly day: number;
  /** Minutes from midnight to the start. */
  readonly startMinute: number;
  readonly minutes: number;
  readonly isAlongside: boolean;
};

export type GallerySession = {
  readonly id: string;
  readonly kind: "agent" | "app" | "browser" | "dev" | "mcp";
  readonly name: string;
  readonly meta: readonly string[];
};

export type GallerySignIn = {
  readonly name: string;
  readonly ip: string;
  readonly city: string;
  readonly country: string;
};

export type GalleryData = {
  readonly set: GallerySet;
  readonly language: Language;
  /** The owner's first name in the sidebar header; `null` before the server has told. */
  readonly ownerName: null | string;
  readonly projects: readonly GalleryProject[];
  readonly tasks: readonly GalleryTask[];
  /** The subtasks of the task in the detail view (the footer's submit label lists the solved). */
  readonly subtasks: readonly GallerySubtask[];
  readonly inboxCount: number;
  /** The inbox captures shown as cards, the first one the longest. */
  readonly inboxTexts: readonly string[];
  readonly running: GalleryRunning | null;
  readonly alongside: GalleryRunning | null;
  readonly blocks: readonly GalleryBlock[];
  /** Durations the formatters show as they come: 0 m, 1 m, 23 h 59 m. */
  readonly durations: readonly number[];
  readonly sessions: readonly GallerySession[];
  readonly signIn: GallerySignIn | null;
  /** Counts the plural forms must get right in the language (RU: 1, 2, 5, 11, 21, 22, 25). */
  readonly pluralCounts: readonly number[];
  readonly description: null | string;
  readonly link: null | string;
};
