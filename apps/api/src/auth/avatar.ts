import { eq } from "drizzle-orm";

import type { Db } from "../shared/db/d1.ts";
import type { TelegramTarget } from "../shared/telegram-api.ts";
import type { User } from "./users.ts";

import { userAvatars, users } from "../shared/db/d1-schema.ts";

export type Avatar = {
  readonly data: string;
  readonly mime: "image/jpeg" | "image/png" | "image/webp";
};

const MAX_AVATAR_BYTES = 512 * 1024;
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const telegramResult = async (
  target: TelegramTarget,
  method: string,
  body: object,
): Promise<unknown> => {
  const response = await target.fetch(`${target.apiRoot}/bot${target.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return undefined;
  }
  const answer: unknown = await response.json();
  return typeof answer === "object" &&
    answer !== null &&
    "ok" in answer &&
    answer.ok === true &&
    "result" in answer
    ? answer.result
    : undefined;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const isSafeFilePath = (path: string): boolean =>
  /^[\w./-]+$/u.test(path) && !path.split("/").includes("..") && !path.startsWith("/");

const isPhotoMime = (value: string): value is Avatar["mime"] => PHOTO_MIME.has(value);

const base64 = (bytes: Uint8Array): string => {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCodePoint(...bytes.subarray(index, index + 8192)));
  }
  return btoa(chunks.join(""));
};

const photoFileId = async (
  target: TelegramTarget,
  userId: number,
): Promise<null | string | undefined> => {
  const result = record(
    await telegramResult(target, "getUserProfilePhotos", { user_id: userId, limit: 1 }),
  );
  const photos: unknown = result?.photos;
  if (!Array.isArray(photos)) {
    return undefined;
  }
  if (photos.length === 0) {
    return null;
  }
  const first: unknown = photos[0];
  if (!Array.isArray(first)) {
    return undefined;
  }
  const last: unknown = first.at(-1);
  const fileId = record(last)?.file_id;
  return typeof fileId === "string" ? fileId : undefined;
};

const photoPath = async (target: TelegramTarget, fileId: string): Promise<string | undefined> => {
  const file = record(await telegramResult(target, "getFile", { file_id: fileId }));
  const path = file?.file_path;
  return typeof path === "string" && isSafeFilePath(path) ? path : undefined;
};

const downloadAvatar = async (
  target: TelegramTarget,
  path: string,
): Promise<Avatar | undefined> => {
  const response = await target.fetch(`${target.apiRoot}/file/bot${target.token}/${path}`);
  if (!response.ok || Number(response.headers.get("Content-Length") ?? 0) > MAX_AVATAR_BYTES) {
    return undefined;
  }
  const mime = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mime === undefined || !isPhotoMime(mime)) {
    return undefined;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES
    ? undefined
    : { data: base64(bytes), mime };
};

/** `null` means no Telegram photo; `undefined` leaves a cached photo intact after a fetch failure. */
export const readTelegramAvatar = async (
  target: TelegramTarget,
  telegramId: string,
): Promise<Avatar | null | undefined> => {
  try {
    const userId = Number(telegramId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return undefined;
    }
    const fileId = await photoFileId(target, userId);
    if (fileId === null || fileId === undefined) {
      return fileId;
    }
    const path = await photoPath(target, fileId);
    return path === undefined ? undefined : await downloadAvatar(target, path);
  } catch {
    return undefined;
  }
};

/** Refreshes the copy on each real login; transient Telegram failures preserve the last copy. */
export const refreshAvatar = async (
  db: Db,
  user: User,
  { apiOrigin, target }: { readonly target: TelegramTarget; readonly apiOrigin: string },
): Promise<User> => {
  const avatar = await readTelegramAvatar(target, user.telegramId);
  if (avatar === undefined) {
    return user;
  }
  const photoUrl = avatar === null ? null : `${apiOrigin}/api/avatars/${user.id}?v=${Date.now()}`;
  if (avatar === null) {
    await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  } else {
    await db
      .insert(userAvatars)
      .values({ userId: user.id, ...avatar })
      .onConflictDoUpdate({
        target: userAvatars.userId,
        set: avatar,
      });
  }
  await db.update(users).set({ photoUrl }).where(eq(users.id, user.id));
  return { ...user, photoUrl };
};

/** Reads cached bytes for the public image route. */
export const cachedAvatar = async (
  db: Db,
  userId: string,
): Promise<null | { readonly mime: string; readonly bytes: Uint8Array }> => {
  const row = await db.query.userAvatars.findFirst({ where: eq(userAvatars.userId, userId) });
  if (row === undefined) {
    return null;
  }
  const binary = atob(row.data);
  return { mime: row.mime, bytes: Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0) };
};
