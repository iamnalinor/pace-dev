import { z } from "zod";

export const ConfirmationCreateSchema = z.strictObject({
  action: z.enum(["wipe", "delete"]),
});

export const ConfirmationParamsSchema = z.strictObject({
  id: z.uuid(),
});

/** Opaque polling capability: the response reveals no account details. */
export const ConfirmationCreatedSchema = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
});

export const ConfirmationStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "expired", "replaced"]),
});
