import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

export const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

/** HMAC-SHA-256 of `message` under a raw `key`, as lowercase hex. */
export const hmacSha256Hex = async (key: ArrayBuffer, message: string): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
};

/** Constant-time comparison of two strings (false on length mismatch). */
export const isTimingSafeEqual = (a: string, b: string): boolean => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
};

/** `byteLength` random bytes as unpadded base64url (4 chars per 3 bytes). */
export const randomBase64Url = (byteLength: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};
