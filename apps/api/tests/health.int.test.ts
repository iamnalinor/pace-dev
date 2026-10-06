import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const api = exports.default;

describe("GET /api/health", () => {
  it("answers ok", async () => {
    const response = await api.fetch(new Request("https://pace-api.test/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const response = await api.fetch(new Request("https://pace-api.test/api/nope"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "not-found", message: "Not found" });
  });
});
