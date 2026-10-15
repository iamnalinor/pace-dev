import { createHash } from "node:crypto";

import { isForSession, sessionHashOf } from "./session-fingerprint.ts";

it("uses the bearer fingerprint without putting the bearer in notification data", async () => {
  const token = "session-a";
  const expected = createHash("sha256").update(token).digest("hex");
  expect(await sessionHashOf(token)).toBe(expected);
  expect(await isForSession({ sessionHash: expected }, token)).toBe(true);
  expect(await isForSession({ sessionHash: expected }, "session-b")).toBe(false);
});
