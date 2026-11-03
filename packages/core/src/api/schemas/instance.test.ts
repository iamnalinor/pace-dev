import { describe, expect, it } from "vitest";

import { endpoints } from "../endpoints.ts";

const answer = {
  apiOrigin: "https://api.pace.test",
  botUsername: "PaceBot",
  features: { assistant: true, push: true },
  loginMethods: ["telegram-widget", "telegram-deeplink"],
  minClientProtocol: 1,
  name: "Pace",
  protocol: 1,
  version: "v1.0.0",
  webOrigin: "https://pace.test",
};

describe("the instance answer", () => {
  it("reads an old response without Firebase metadata as null", () => {
    expect(endpoints.instance.output.parse(answer).firebase).toBeNull();
  });

  it("keeps the instance readable when the Firebase field is malformed or unknown", () => {
    const duplicate = { apiKey: "key", appId: "app", packageName: "app.example.pace" };
    for (const firebase of [
      null,
      "future representation",
      { projectId: "pace-test", senderId: "123456", apps: [] },
      { projectId: "pace-test", senderId: "123456", apps: [{ packageName: "app.example.pace" }] },
      { projectId: "pace-test", senderId: "123456", apps: [duplicate, duplicate] },
    ]) {
      expect(endpoints.instance.output.parse({ ...answer, firebase })).toMatchObject({
        firebase: null,
        protocol: answer.protocol,
      });
    }
  });

  it("reads what a newer server adds without refusing the answer", () => {
    const read = endpoints.instance.output.parse({
      ...answer,
      features: { push: true, telepathy: true },
      loginMethods: ["passkey", "telegram-deeplink"],
      region: "eu",
      webOrigin: 42,
    });
    expect(read.loginMethods).toEqual(["telegram-deeplink"]);
    expect(read.features).toEqual({ assistant: false, mcp: true, push: true });
    expect(read.webOrigin).toBeNull();
    expect(read).not.toHaveProperty("region");
  });

  it("reads a server that names no features as one with every feature off (class 13), but MCP", () => {
    const { features: _omitted, ...withoutFeatures } = answer;
    // Every server served MCP before one could be without it (a LAN-http server, re-review N4):
    // one that does not say has it.
    expect(endpoints.instance.output.parse(withoutFeatures).features).toEqual({
      assistant: false,
      mcp: true,
      push: false,
    });
  });

  it("reads a server without MCP (no https origin) as `mcp: false` (re-review N4)", () => {
    const read = endpoints.instance.output.parse({
      ...answer,
      features: { ...answer.features, mcp: false },
    });
    expect(read.features.mcp).toBe(false);
  });

  it("reads a server without a web app as `webOrigin: null`", () => {
    const { webOrigin: _omitted, ...withoutWeb } = answer;
    expect(endpoints.instance.output.parse(withoutWeb).webOrigin).toBeNull();
  });
});
