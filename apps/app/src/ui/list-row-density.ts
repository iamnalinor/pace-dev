import type { RowDensity } from "./list-row-types.ts";

/**
A row's box on a phone or a tablet (spec §4.1.1, §3.7): 52 high with the row padding. The press
target (`min-h-hit`, 48 dp, on the kit Pressable around it) is the only other minimum, so no class
order decides the height; `compact` takes the target itself, never less than 48 dp. The desktop
density (44) is the web's alone: an Android tablet past 1024 dp is still touched (`.web.ts`).
*/
export const ROW_BOX: Readonly<Record<RowDensity, string>> = {
  compact: "px-row-x py-row-y",
  regular: "min-h-row px-row-x py-row-y",
};
