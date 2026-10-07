import type { ActionError } from "@pace/client";

import { en, type MessageKey, type MessageParams } from "@pace/core";

type Translate = (key: MessageKey, params?: MessageParams) => string;

const isMessageKey = (key: string): key is MessageKey => Object.hasOwn(en, key);

/**
The sentence a toast shows for an action's error: every code has its own
`actionError.<code>` message; store refusals (`dispatch/…`) fall back to the generic one.
*/
export const errorText = (translate: Translate, code: ActionError): string => {
  const key = `actionError.${code}`;
  return isMessageKey(key) ? translate(key) : translate("actionError.generic", { code });
};
