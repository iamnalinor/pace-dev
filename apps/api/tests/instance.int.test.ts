import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  CLIENT_OUTDATED,
  endpoints,
  MIN_CLIENT_PROTOCOL,
  PROTOCOL,
  PROTOCOL_HEADER,
} from "@pace/core";

import { answerOf, api, call, loginAsDev, readJson } from "./helpers.ts";

/** Calls as an app older than the server serves would make them. */
const OUTDATED = { headers: { [PROTOCOL_HEADER]: "0" } };

describe("GET /api/instance", () => {
  it("says what this server is, without a token", async () => {
    const instance = await answerOf(endpoints.instance, "/api/instance");
    expect(instance).toEqual({
      apiOrigin: env.API_ORIGIN,
      botUsername: env.TELEGRAM_BOT_USERNAME,
      // The test Worker answers from its built-in fake model (LLM_PROVIDER=fake).
      features: { assistant: true, push: false },
      loginMethods: ["telegram-widget", "telegram-deeplink"],
      minClientProtocol: MIN_CLIENT_PROTOCOL,
      name: "Pace",
      protocol: PROTOCOL,
      version: "dev",
      webOrigin: env.WEB_ORIGIN,
    });
  });
});

describe(`the ${PROTOCOL_HEADER} header`, () => {
  it("refuses an app older than the server serves, with a code the app can act on", async () => {
    const token = await loginAsDev("1001");
    const response = await call("/api/me", { token, ...OUTDATED });
    expect(response.status).toBe(426);
    expect(await readJson<{ code: string }>(response)).toMatchObject({ code: CLIENT_OUTDATED });
  });

  it("refuses before asking for a token, and the web app can read the refusal", async () => {
    const response = await call("/api/me", {
      headers: { Origin: env.WEB_ORIGIN, [PROTOCOL_HEADER]: "0" },
    });
    expect(response.status).toBe(426);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(env.WEB_ORIGIN);
  });

  it("serves the current protocol, no header at all (an older app) and an unreadable one", async () => {
    const token = await loginAsDev("1001");
    for (const headers of [
      { [PROTOCOL_HEADER]: String(PROTOCOL) },
      {},
      { [PROTOCOL_HEADER]: "abc" },
    ]) {
      expect((await call("/api/me", { headers, token })).status).toBe(200);
    }
  });

  it("never refuses the calls an outdated app needs to learn why", async () => {
    expect((await call("/api/instance", OUTDATED)).status).toBe(200);
    expect((await call("/api/health", OUTDATED)).status).toBe(200);
  });

  it("is a header the web app may send", async () => {
    const response = await api.fetch(
      new Request("https://pace-api.test/api/me", {
        headers: {
          "Access-Control-Request-Headers": `authorization, ${PROTOCOL_HEADER.toLowerCase()}`,
          "Access-Control-Request-Method": "GET",
          Origin: env.WEB_ORIGIN,
        },
        method: "OPTIONS",
      }),
    );
    const allowed = (response.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase();
    expect(allowed.split(/,\s*/u)).toContain(PROTOCOL_HEADER.toLowerCase());
  });

  it("refuses an outdated app's live socket (a socket cannot carry the header: it is in the address)", async () => {
    const token = await loginAsDev("1001");
    const response = await api.fetch(
      new Request("https://pace-api.test/api/sync/live?device=phone-1&protocol=0", {
        headers: { "Sec-WebSocket-Protocol": `pace.v1, pace.auth.${token}`, Upgrade: "websocket" },
      }),
    );
    expect(response.status).toBe(426);
    expect(await readJson<{ code: string }>(response)).toMatchObject({ code: CLIENT_OUTDATED });
  });
});
