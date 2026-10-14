import type { MessageKey } from "@pace/core";

/** Where the open form came from: filled in by hand (or by the rules), or by the assistant. */
export type FormOrigin = "assistant" | "by-hand";

/**
The form's title, in one place and from the form's origin alone: "New task" for a form opened
or filled by hand, "Suggested by the assistant" while it holds the assistant's reading. The
assistant's other proposals (changing or deleting a task) will name themselves here as well.
*/
export const formTitleKey = (origin: FormOrigin): MessageKey =>
  origin === "assistant" ? "composer.form.suggested" : "form.newTask";
