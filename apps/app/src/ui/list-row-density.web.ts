import type { RowDensity } from "./list-row-types.ts";

/**
A row's box on the web (spec §4.1.1): 52 on a phone and 44 on a desktop (`lg`, with the desktop's
row padding); `compact` 44 everywhere. Both are at or above the web's 44 px target.
*/
export const ROW_BOX: Readonly<Record<RowDensity, string>> = {
  compact: "min-h-row-compact px-row-x py-row-y lg:py-row-y-lg",
  regular: "min-h-row px-row-x py-row-y lg:min-h-row-compact lg:py-row-y-lg",
};
