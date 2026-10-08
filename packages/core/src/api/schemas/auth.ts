import { z } from "zod";

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
  username: z.string().nullable(),
  photoUrl: z.string().nullable(),
});

export type User = z.output<typeof UserSchema>;

/** A fresh bearer session: the token is shown once, the client keeps it. */
export const AuthSessionSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

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
