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
  it("reads what a newer server adds without refusing the answer", () => {
    const read = endpoints.instance.output.parse({
      ...answer,
      features: { push: true, telepathy: true },
      loginMethods: ["passkey", "telegram-deeplink"],
      region: "eu",
      webOrigin: 42,
    });
    expect(read.loginMethods).toEqual(["telegram-deeplink"]);
    expect(read.features).toEqual({ assistant: false, push: true });
    expect(read.webOrigin).toBeNull();
    expect(read).not.toHaveProperty("region");
  });

  it("reads a server without a web app as `webOrigin: null`", () => {
    const { webOrigin: _omitted, ...withoutWeb } = answer;
    expect(endpoints.instance.output.parse(withoutWeb).webOrigin).toBeNull();
  });
});
