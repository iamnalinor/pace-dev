import type { Instance } from "@pace/core";

import { serverInfoOf } from "./server-store.ts";

const instance = (apiOrigin: string): Instance => ({
  apiOrigin,
  botUsername: "PaceTestBot",
  features: { assistant: false, mcp: true, push: false },
  loginMethods: ["telegram-deeplink"],
  minClientProtocol: 1,
  name: "Pace",
  protocol: 1,
  version: "dev",
  webOrigin: "http://localhost:4247",
});

describe("the server's address the screens hand out (QA round 18 L10)", () => {
  it("is the origin the app talks to when the server names another one", () => {
    // A Worker started with its dev `API_ORIGIN` (8787) on another port: the named one is dead.
    const info = serverInfoOf({
      instance: instance("http://localhost:8787"),
      origin: "http://localhost:8818",
      reason: null,
      status: "ok",
    });
    expect(info.apiOrigin).toBe("http://localhost:8818");
  });

  it("is the origin the app talks to before the server answered", () => {
    const info = serverInfoOf({
      instance: null,
      origin: "https://pace.example.org",
      reason: null,
      status: "unknown",
    });
    expect(info.apiOrigin).toBe("https://pace.example.org");
  });

  it("keeps the server's own values for the rest", () => {
    const info = serverInfoOf({
      instance: instance("https://pace.example.org"),
      origin: "https://pace.example.org",
      reason: null,
      status: "ok",
    });
    expect(info).toMatchObject({
      apiOrigin: "https://pace.example.org",
      botUsername: "PaceTestBot",
      webOrigin: "http://localhost:4247",
    });
  });
});

describe("the MCP URL the screens hand out (round 7 review 1)", () => {
  it("is the server's own public API, the OAuth resource it issues tokens for, when it differs", () => {
    // The Worker's protected resource is `${API_ORIGIN}/mcp` (apps/api/src/worker.ts): an MCP
    // client refuses tokens for any other resource than the URL it was given.
    const info = serverInfoOf({
      instance: instance("https://pace.example.org"),
      origin: "https://pace.lan:8443",
      reason: null,
      status: "ok",
    });
    expect(info.mcpUrl).toBe("https://pace.example.org/mcp");
    // The computer agent's bearer tokens work at any address: it keeps the one this device uses.
    expect(info.apiOrigin).toBe("https://pace.lan:8443");
    expect(info.isPublicOriginOther).toBe(true);
  });

  it("is the address in use, with nothing to say, while the two agree or the server has not answered", () => {
    const agreed = serverInfoOf({
      instance: instance("https://pace.example.org"),
      origin: "https://pace.example.org",
      reason: null,
      status: "ok",
    });
    expect(agreed.mcpUrl).toBe("https://pace.example.org/mcp");
    expect(agreed.isPublicOriginOther).toBe(false);
    const unknown = serverInfoOf({
      instance: null,
      origin: "https://pace.example.org",
      reason: null,
      status: "unknown",
    });
    expect(unknown.mcpUrl).toBe("https://pace.example.org/mcp");
    expect(unknown.isPublicOriginOther).toBe(false);
  });

  it("hands out no MCP URL when the server says it has no MCP (re-review N4)", () => {
    const lan = instance("https://pace.lan:8443");
    const info = serverInfoOf({
      instance: { ...lan, features: { ...lan.features, mcp: false } },
      origin: "https://pace.lan:8443",
      reason: null,
      status: "ok",
    });
    expect(info.mcpUrl).toBeNull();
  });
});
