import { Share } from "react-native";

import type { MessageKey } from "@pace/core";

/** On a phone the command goes on through the share sheet (to the computer, by chat or mail). */
export const SHARE_LABEL_KEY: MessageKey = "devices.share";

/** How passing the command on went. */
export type ShareOutcome = "done" | "failed";

export const shareText = async (text: string): Promise<ShareOutcome> => {
  try {
    await Share.share({ message: text });
    return "done";
  } catch {
    return "failed";
  }
};
