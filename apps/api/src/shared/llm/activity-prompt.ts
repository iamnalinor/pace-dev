import { ACTIVITY_CATEGORIES, type CoreState, type Language } from "@pace/core";

import type { ParsePrompt } from "./prompt.ts";

/** The first words of the activity prompt: the fake model tells the two prompts apart by them. */
export const ACTIVITY_PROMPT_MARK = "You read a short note from a time tracker.";

const MAX_LABELS = 20;

const RULES = `${ACTIVITY_PROMPT_MARK} The person typed what they are doing right now. Answer with JSON:
- label: a short name of the activity (2–4 words) in the note's language, capitalised, without the length or filler words, e.g. "Пошёл в ЦСС, 20мин" → "ЦСС". Never translate it. Prefer one of the person's own labels below when it means the same thing.
- category: one of ${ACTIVITY_CATEGORIES.join(", ")}. work = paid work, study = learning, task = a planned task, food = eating, commute = getting somewhere, hygiene = washing and getting ready, rest = a break, chores = housework and errands, social = time with people, sport = exercise, sleep, other = anything else.
- expectMinutes: the length the note states ("20мин" → 20, "1.5h" → 90); without one, a typical length when it is obvious (a shower ≈ 15), else null.`;

/** The person's own recent labels, newest first, each once. */
const labelsOf = (state: CoreState): readonly string[] => {
  const labels = Object.values(state.time.activities)
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))
    .map((activity) => activity.label.trim());
  return [...new Set(labels)].slice(0, MAX_LABELS);
};

/** The instructions, the person's labels and the interface language; the note as the message. */
export const buildActivityPrompt = (
  text: string,
  world: { readonly state: CoreState; readonly language: Language },
): ParsePrompt => {
  const labels = labelsOf(world.state).map((label) => `- ${label}`);
  const known = labels.length === 0 ? "(none)" : labels.join("\n");
  return {
    prompt: text,
    system: [
      RULES,
      `Interface language: ${world.language}.`,
      `The person's labels:\n${known}`,
    ].join("\n\n"),
  };
};
