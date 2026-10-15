import { type ComputerOs, computerOsOf } from "@pace/client";

type Hints = Navigator & { readonly userAgentData?: { readonly platform?: string } };

/**
The system of the computer this browser runs on, to preselect its install steps: the client
hints first, then `navigator.platform`, then the user agent. A phone's browser says nothing
(its platform may read "Linux", so the whole set is checked for a phone first).
*/
export const browserComputerOs = (): ComputerOs | null => {
  const browser = navigator as Hints;
  const hints = [browser.userAgentData?.platform, browser.platform, browser.userAgent].filter(
    (hint): hint is string => typeof hint === "string" && hint !== "",
  );
  return computerOsOf(hints.join(" ")) === null
    ? null
    : (hints.map((hint) => computerOsOf(hint)).find((os) => os !== null) ?? null);
};
