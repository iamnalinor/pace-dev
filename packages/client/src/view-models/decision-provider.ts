/** How the assistant log names who read a message: never a provider's internal name. */
export type ProviderLabel =
  | { readonly kind: "assistant" }
  | { readonly kind: "model"; readonly name: string }
  | { readonly kind: "rules" };

/** The provider names rows held before the provider was a model identifier ("groq-2" too). */
const LEGACY: ReadonlySet<string> = new Set(["compatible", "groq", "gemini", "fake"]);

const isNumber = (text: string): boolean => /^\d+$/u.test(text);

/** What follows the last `mark` when it is a number ("groq-2", "gpt-5.6-luna#2") cut off. */
const withoutNumber = (name: string, mark: string): string => {
  const at = name.lastIndexOf(mark);
  return at !== -1 && isNumber(name.slice(at + 1)) ? name.slice(0, at).trim() : name;
};

/**
The model behind a decision as the log shows it: a model identifier ("gpt-5.6-luna", the "#2"
of a second key dropped), the local rules, or for an older row just "the assistant model".
*/
export const providerLabel = (provider: null | string): null | ProviderLabel => {
  // A second key of one model ("gpt-5.6-luna#2") is still that model.
  const name = withoutNumber(provider === null ? "" : provider.trim(), "#");
  if (name === "") {
    return null;
  }
  if (name === "rules") {
    return { kind: "rules" };
  }
  return LEGACY.has(withoutNumber(name, "-")) ? { kind: "assistant" } : { kind: "model", name };
};
