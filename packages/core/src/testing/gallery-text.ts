import type { ProjectColorName } from "../design/token-types.ts";
import type { Language } from "../i18n/language.ts";
import type { GalleryTask } from "./gallery-types.ts";

/** Text and names the worst-case sets are built from (the fixtures' words, in both languages). */

/** Text of exactly `length` characters made of `phrase` repeated (a trailing space becomes a dot). */
export const filler = (phrase: string, length: number): string =>
  phrase
    .repeat(Math.ceil(length / phrase.length))
    .slice(0, length)
    .replace(/\s$/u, ".");

export const PHRASES: Readonly<Record<Language, string>> = {
  en: "Prepare the quarterly report and send it for review before the committee meets ",
  ru: "Подготовить квартальный отчёт и отправить его на проверку до заседания комитета ",
};

export const PROJECT_PHRASES: Readonly<Record<Language, string>> = {
  en: "Interdisciplinary research programme on long-term adaptation ",
  ru: "Междисциплинарная исследовательская программа долгосрочной адаптации ",
};

/** The longest word the languages build: no space to wrap at. */
export const LONG_WORD: Readonly<Record<Language, string>> = {
  en: "Electroencephalographicinterpretation",
  ru: "Электроэнцефалографическийэлектрокардиографический",
};

export const UNBREAKABLE_URL =
  "https://example.com/storage/documents/2026/quarterly-reports/final-version-for-the-committee/attachment-0001.pdf?download=1&session=abc123def456";

/** An IPv6 address: seven colons and no space to wrap at. */
export const IPV6 = ["2001", "0db8", "85a3", "0000", "0000", "8a2e", "0370", "7334"].join(":");

const COLORS: readonly ProjectColorName[] = [
  "blue",
  "violet",
  "green",
  "amber",
  "coral",
  "pink",
  "teal",
  "slate",
  "orange",
  "yellow",
];

export const colorAt = (index: number): ProjectColorName =>
  COLORS[index % COLORS.length] ?? "slate";

export const RUNNING_LABELS: Readonly<Record<Language, string>> = {
  en: "Reading the committee's proposals and writing a reply to every one of them in turn ",
  ru: "Чтение предложений комитета и ответ на каждое из них по очереди, одно за другим ",
};

export const NAME_80: Readonly<Record<Language, string>> = {
  en: "Work laptop of the research department, third floor, the corner room by the stairs ",
  ru: "Рабочий ноутбук исследовательского отдела, третий этаж, угловая комната у лестницы ",
};

export const PLURAL_COUNTS = [1, 2, 5, 11, 21, 22, 25] as const;

export const task = (
  index: number,
  title: string,
  options: Partial<Omit<GalleryTask, "id" | "title">> = {},
): GalleryTask => ({
  id: `task-${String(index)}`,
  importance: "normal",
  isDimmed: false,
  isRepeating: false,
  leftMinutes: null,
  projectId: null,
  subtasksLeft: 0,
  ...options,
  title,
});
