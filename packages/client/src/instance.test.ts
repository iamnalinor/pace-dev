import { describe, expect, it } from "vitest";

import { InstanceSchema } from "@pace/core";

import { createFakeFetch, fakeInstance, problem } from "./fake-fetch.fake.ts";
import { checkInstance } from "./instance.ts";

const offline = async (): Promise<Response> => {
  throw new TypeError("Network request failed");
};

const serverAnswering = (answer: () => unknown) =>
  createFakeFetch({ "GET /api/instance": answer }).fetch;

describe("checkInstance", () => {
  it("reads the server's instance through the endpoint's own schema", async () => {
    const fake = createFakeFetch({ "GET /api/instance": () => fakeInstance });
    const result = await checkInstance("https://pace.example.dev", fake.fetch);
    expect(result).toEqual({ ok: true, value: InstanceSchema.parse(fakeInstance) });
    expect(fake.calls).toEqual([expect.objectContaining({ method: "GET", path: "/api/instance" })]);
  });

  it("calls a server that has no /api/instance not a Pace one", async () => {
    const result = await checkInstance("https://pace.example.dev", createFakeFetch({}).fetch);
    expect(result).toEqual({ error: "not-pace", ok: false });
  });

  it("calls an answer that is not an instance not a Pace one", async () => {
    const html = serverAnswering(() => new Response("<html>hello</html>", { status: 200 }));
    expect(await checkInstance("https://example.dev", html)).toEqual({
      error: "not-pace",
      ok: false,
    });
    const other = serverAnswering(() => ({ hello: "world" }));
    expect(await checkInstance("https://example.dev", other)).toEqual({
      error: "not-pace",
      ok: false,
    });
  });

  it("tells a server it cannot reach", async () => {
    expect(await checkInstance("https://pace.example.dev", offline)).toEqual({
      error: "unreachable",
      ok: false,
    });
    const down = serverAnswering(() => problem(503, "unavailable"));
    expect(await checkInstance("https://pace.example.dev", down)).toEqual({
      error: "unreachable",
      ok: false,
    });
  });

  it("refuses a server older than this app supports", async () => {
    const old = serverAnswering(() => ({ ...fakeInstance, minClientProtocol: 0, protocol: 0 }));
    expect(await checkInstance("https://pace.example.dev", old)).toEqual({
      error: "server-outdated",
      ok: false,
    });
  });

  it("refuses a server that needs a newer app", async () => {
    const newer = serverAnswering(() => ({ ...fakeInstance, minClientProtocol: 2, protocol: 2 }));
    expect(await checkInstance("https://pace.example.dev", newer)).toEqual({
      error: "client-outdated",
      ok: false,
    });
  });
});
