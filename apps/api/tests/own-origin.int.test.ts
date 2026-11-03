import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findUserIdByTelegramId } from "../src/auth/users.ts";
import { oauthOrigin, ownOrigin } from "../src/shared/config.ts";
import { d1 } from "../src/shared/db/d1.ts";
import worker, { providerOptions } from "../src/worker.ts";
import { loginAsDev, readJson } from "./helpers.ts";

/**
Review I3 of the PR #48 follow-ups: the Worker's own origin, configured or reached, is either one
the OAuth provider accepts (https, or http on a loopback host; canonical: lower case, no default
port, no path) or none, and then the app is served without OAuth and MCP. Never a throw on every
request.
*/

// eslint-disable-next-line sonarjs/no-hardcoded-ip -- a self-hoster's LAN address is what is under test
const LAN_HOST = "192.168.1.5";
const LAN = `http://${LAN_HOST}:8787`;

const hosts = fc.constantFrom(
  "pace.example.com",
  "Pace.Example.COM",
  "localhost",
  "127.0.0.1",
  "127.1.2.3",
  "[::1]",
  LAN_HOST,
  "xn--80ak6aa92e.com",
);
const schemes = fc.constantFrom("https", "http", "HTTPS", "Http", "ftp");
const ports = fc.constantFrom("", ":443", ":80", ":8787", ":8443");
const tails = fc.constantFrom("", "/", "/api", "//", "/?x=1");
const configured = fc.oneof(
  fc.constantFrom(undefined, "", "  ", "not a url", "pace.example.com"),
  fc.tuple(schemes, hosts, ports, tails).map(([s, h, p, t]) => ` ${s}://${h}${p}${t} `),
);
const reached = fc
  .tuple(fc.constantFrom("https", "http"), hosts, ports)
  .map(([s, h, p]) => `${s}://${h}${p}/api/instance`);

describe("the Worker's own origin (review I3)", () => {
  it("is one the OAuth provider builds from, or none: never a throw", () => {
    fc.assert(
      fc.property(configured, reached, (value, url) => {
        const origin = oauthOrigin(value, url);
        // `new OAuthProvider` throws for an origin it refuses: the bug this guards.
        const built = origin === null ? null : new OAuthProvider(providerOptions(origin));
        expect(origin === null || (built !== null && origin === new URL(origin).origin)).toBe(true);
        // `/api/instance` always has an address to name.
        expect(ownOrigin(value, url)).toBe(new URL(ownOrigin(value, url)).origin);
      }),
      { numRuns: 400 },
    );
  });

  it("normalises a configured origin: case, a trailing slash, a default port", () => {
    const url = "https://elsewhere.test/api/instance";
    for (const value of [
      "https://Pace.Example.com",
      "https://pace.example.com/",
      "https://pace.example.com:443",
      "HTTPS://pace.example.com/api",
    ]) {
      expect(oauthOrigin(value, url)).toBe("https://pace.example.com");
    }
    // http only on a loopback host; elsewhere it is ignored for the reached origin.
    expect(oauthOrigin("http://localhost:8787/", url)).toBe("http://localhost:8787");
    expect(oauthOrigin(LAN, url)).toBe("https://elsewhere.test");
    expect(oauthOrigin(" ", `${LAN}/x`)).toBeNull();
  });
});

/** The Worker as deployed with `API_ORIGIN` set to `apiOrigin`, asked at `url`. */
const fetchAt = async (url: string, apiOrigin: string, init?: RequestInit): Promise<Response> => {
  const configured: Cloudflare.Env = { ...env };
  // The provider leaves its helpers on the env it is handed (the tests' shared one, after any
  // request through it): a server it never fronted has none.
  const override: Readonly<Record<string, string | undefined>> = {
    API_ORIGIN: apiOrigin,
    OAUTH_PROVIDER: undefined,
  };
  Object.assign(configured, override);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(url, init), configured, ctx);
  await waitOnExecutionContext(ctx);
  return response;
};

describe("a Worker no OAuth origin fits (review I3)", () => {
  it("serves the app and answers OAuth and MCP with a 503 that says why", async () => {
    const lan = LAN;
    for (const apiOrigin of ["", LAN]) {
      const health = await fetchAt(`${lan}/api/health`, apiOrigin);
      expect(health.status).toBe(200);
      const instance = await fetchAt(`${lan}/api/instance`, apiOrigin);
      expect(instance.status).toBe(200);
      // The app is told, so Connect an AI app does not hand out a URL that answers 503 (N4).
      expect(await readJson<{ features: { mcp: boolean } }>(instance)).toMatchObject({
        features: { mcp: false },
      });
      for (const path of [
        "/mcp",
        "/oauth/token",
        "/authorize",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource/mcp",
      ]) {
        const response = await fetchAt(`${lan}${path}`, apiOrigin);
        expect({ path, status: response.status }).toEqual({ path, status: 503 });
        const body = await readJson<{ error_description: string }>(response);
        expect(body.error_description).toContain("API_ORIGIN");
      }
    }
  });

  it("deletes an account with no OAuth provider mounted: the grants go through KV (re-review N4)", async () => {
    const telegramId = "1001";
    const token = await loginAsDev(telegramId);
    const userId = await findUserIdByTelegramId(d1(env.DB), telegramId);
    expect(userId).not.toBeNull();
    // A grant left from when the server had an https origin, with one of its tokens.
    await env.OAUTH_KV.put(`grant:${String(userId)}:g1`, JSON.stringify({ id: "g1" }));
    await env.OAUTH_KV.put(`token:${String(userId)}:g1:t1`, "{}");
    const response = await fetchAt(`${LAN}/api/test/account`, "", {
      headers: { Authorization: `Bearer ${token}` },
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(await env.OAUTH_KV.get(`grant:${String(userId)}:g1`)).toBeNull();
    expect(await env.OAUTH_KV.get(`token:${String(userId)}:g1:t1`)).toBeNull();
    expect(await findUserIdByTelegramId(d1(env.DB), telegramId)).toBeNull();
  });

  it("says MCP is there when an origin fits (re-review N4)", async () => {
    const instance = await fetchAt("https://pace-api.test/api/instance", "");
    expect(await readJson<{ features: { mcp: boolean } }>(instance)).toMatchObject({
      features: { mcp: true },
    });
  });

  it("answers at a configured origin with a trailing slash, the well-known path too", async () => {
    const response = await fetchAt(
      "https://pace-api.test/.well-known/oauth-protected-resource/mcp",
      "https://Pace-API.test/",
    );
    expect(response.status).toBe(200);
    expect(await readJson<{ resource: string }>(response)).toMatchObject({
      resource: "https://pace-api.test/mcp",
    });
  });
});
