import { z } from "zod";

import { SequencedSyncRecordSchema, StoreIdSchema } from "./sync.ts";

export const SyncBootstrapQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export const SyncBootstrapOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), storeId: StoreIdSchema }),
  z.object({
    kind: z.literal("checkpoint"),
    storeId: StoreIdSchema,
    checkpointJson: z.string(),
    checkpointSha256: z.string().regex(/^[a-f0-9]{64}$/),
    throughSeq: z.int().nonnegative(),
    records: z.array(SequencedSyncRecordSchema),
    seq: z.int().nonnegative(),
    more: z.boolean(),
  }),
]);
