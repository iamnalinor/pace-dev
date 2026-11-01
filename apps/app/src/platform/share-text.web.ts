import type { MessageKey } from "@pace/core";

import type { ShareOutcome } from "./share-text.ts";

/** In a browser the command is copied, to be pasted into a terminal on the same computer. */
export const SHARE_LABEL_KEY: MessageKey = "devices.copy";

/** The same for a link (the MCP server's URL). */
export const SHARE_URL_LABEL_KEY: MessageKey = "connectAi.copy";

export const shareText = async (text: string): Promise<ShareOutcome> => {
  try {
    await navigator.clipboard.writeText(text);
    return "done";
  } catch {
    return "failed";
  }
};
