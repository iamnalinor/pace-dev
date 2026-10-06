import { describe, expect, it } from "vitest";

import { ApiError, unwrap } from "./unwrap.ts";

const failed = async (status: unknown, value: unknown) =>
  await unwrap(Promise.resolve({ data: null, error: { status, value } }));

describe("unwrap", () => {
  it("returns data of a successful response", async () => {
    await expect(unwrap(Promise.resolve({ data: { id: 1 }, error: null }))).resolves.toEqual({
      id: 1,
    });
  });

  it("throws ApiError with the server's code and message", async () => {
    const request = failed(403, { code: "some/forbidden", message: "Nope" });

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      code: "some/forbidden",
      message: "Nope",
      status: 403,
    });
  });

  it.each([
    ["a body without code", { message: "Too many" }, { code: undefined, message: "Too many" }],
    ["a non-string message", { code: "x", message: 42 }, { code: "x", message: "Request failed" }],
    ["a non-string code", { code: 1, message: "m" }, { code: undefined, message: "m" }],
    ["a plain-text body", "Bad Gateway", { code: undefined, message: "Request failed" }],
    ["an empty body", null, { code: undefined, message: "Request failed" }],
  ])("tolerates %s", async (_case, body, expected) => {
    await expect(failed(502, body)).rejects.toMatchObject({ ...expected, status: 502 });
  });

  it("uses status 0 when there was no HTTP status (network failure)", async () => {
    await expect(failed(undefined, { message: "offline" })).rejects.toMatchObject({ status: 0 });
  });
});
