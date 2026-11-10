import type { LocalSnapshot } from "./checkpoint-store-types.ts";

import { emptySnapshot } from "./checkpoint-store.ts";
/** Clear memory using its held identity; a refused disk clear never adopts another owner. */
export const emptyHeldCopy = (previous: LocalSnapshot | undefined): LocalSnapshot => ({
  ...(previous ?? emptySnapshot()),
  checkpoint: null,
  coverage: "full",
  records: [],
  pendingIds: [],
  cursor: 0,
  storeId: null,
  syncVersion: 0,
});
export const isClearedCopy = (snapshot: LocalSnapshot): boolean =>
  snapshot.owner === null &&
  snapshot.storeId === null &&
  snapshot.cursor === 0 &&
  snapshot.records.length === 0 &&
  snapshot.pendingIds.length === 0 &&
  snapshot.checkpoint === null &&
  snapshot.coverage === "full";
