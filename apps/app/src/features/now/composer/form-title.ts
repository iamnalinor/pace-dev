import type { AiState } from "@pace/client/react";
import type { MessageKey } from "@pace/core";

/**
The form's title, in one place: "New task" for a form opened (or filled) by hand, "Suggested
by the assistant" while it holds the assistant's reading. The assistant's other proposals
(changing or deleting a task) will name themselves here as well.
*/
export const formTitleKey = (ai: AiState): MessageKey =>
  ai.status === "read" ? "composer.form.suggested" : "composer.form.new";
