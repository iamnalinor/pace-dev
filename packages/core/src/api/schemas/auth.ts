import { z } from "zod";

import { StoreIdSchema } from "./sync.ts";

/** What the Telegram Login Widget hands the web app (field names are Telegram's). */
export const TelegramLoginSchema = z.object({
  id: z.number().int(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string(),
});

export type TelegramLogin = z.output<typeof TelegramLoginSchema>;

/** The signed-in person as every client sees them. */
export const UserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  name: z.string(),
  /** Telegram's first name, shown as the owner's name; null until a login has carried one. */
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().nullable(),
});

export type User = z.output<typeof UserSchema>;

/** `GET /api/me`: the person and the id of their store (see `StoreIdSchema`). */
export const MeSchema = UserSchema.extend({ storeId: StoreIdSchema });

export type Me = z.output<typeof MeSchema>;

/** A fresh bearer session: the token is shown once, the client keeps it. */
export const AuthSessionSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

/**
What the app tells about itself when it starts a bot login: the phone's model and its install
id, so the session it opens is named and linked to the phone's usage. The web sends nothing.
*/
export const NonceCreateSchema = z
  .strictObject({
    deviceName: z.string().trim().min(1).max(80).optional(),
    deviceId: z.string().min(1).max(64).optional(),
  })
  .optional();

export const NonceCreatedSchema = z.object({
  nonce: z.string(),
  /** Opens the bot with `/start login_<nonce>`; the bot binds the nonce to the user. */
  deepLink: z.url(),
});

export const NoncePollSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("ready"), token: z.string(), user: UserSchema }),
]);

export const DevLoginSchema = z.object({
  telegramId: z.string().min(1),
});

export const LogoutSchema = z.object({ ok: z.literal(true) });

/** The answer to deleting the account: everything of it is gone. */
export const AccountDeletedSchema = z.object({ deleted: z.literal(true) });
