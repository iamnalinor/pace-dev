import type { Instance } from "@pace/core";

import { serverInfoOf } from "./server-store.ts";

const instance = (apiOrigin: string): Instance => ({
  apiOrigin,
  botUsername: "PaceTestBot",
  features: { assistant: false, push: false },
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
