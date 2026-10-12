import { estimateOf } from "../input/quick-fields.ts";
import { titleOf, toSpan } from "../input/quick-spans.ts";

/** What "What are you doing?" reads at once, before the assistant looks: the words and a length. */
export type TypedActivity = { readonly label: string; readonly expectMinutes: null | number };

/** "Пошёл в ЦСС, 20 мин" → the label "Пошёл в ЦСС", expected to take 20 minutes. */
export const typedActivity = (text: string): TypedActivity => {
  const estimate = estimateOf(text);
  const label = titleOf(
    text,
    estimate.spans.map((found) => toSpan(found)),
  );
  return { expectMinutes: estimate.minutes, label: label === "" ? text.trim() : label };
};
