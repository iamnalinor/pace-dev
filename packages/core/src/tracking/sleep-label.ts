import { type Language, t } from "../i18n/i18n.ts";
import { isAutoSleepId } from "../ids.ts";

/** The label automatic sleep stores on the sleeps it opens: written for the machine, not shown. */
export const AUTO_SLEEP_LABEL = "Sleep";

/**
An activity's label as the person reads it. Automatic sleep's stored "Sleep" is the server's
wording, so it shows as the sleep category in the reader's language (class 42); anything a person
typed, or renamed the sleep to, shows as it is. An automatic sleep's id is its start event's.
*/
export const shownLabel = (
  activity: { readonly id: string; readonly label: string },
  language: Language,
): string =>
  isAutoSleepId(activity.id) && activity.label === AUTO_SLEEP_LABEL
    ? t(language, "category.sleep")
    : activity.label;
