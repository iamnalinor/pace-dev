import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints, OAUTH_SCOPES } from "@pace/core";

import { call, json, loginAsDev, readJson } from "./helpers.ts";
import {
  API_ORIGIN,
  authorizeQuery,
  codeFrom,
  completeConsent,
  exchangeCode,
  getAuthorize,
  mcpCall,
  obtainToken,
  pkce,
  REDIRECT_URI,
  registerClient,
  revokeGrant,
  tokenRequest,
} from "./oauth-flow.ts";

type Metadata = Record<string, unknown>;
type Problem = { code: string; message: string };
type Redirect = { redirectTo: string };

describe("discovery", () => {
  it("publishes the authorization server metadata", async () => {
    const metadata = await json<Metadata>("/.well-known/oauth-authorization-server");
    expect(metadata).toMatchObject({
      authorization_endpoint: `${API_ORIGIN}/authorize`,
      issuer: API_ORIGIN,
      protected_resources: [`${API_ORIGIN}/mcp`],
      registration_endpoint: `${API_ORIGIN}/oauth/register`,
      scopes_supported: [...OAUTH_SCOPES],
      token_endpoint: `${API_ORIGIN}/oauth/token`,
    });
    expect(metadata["code_challenge_methods_supported"]).toEqual(["S256"]);
    expect(metadata["grant_types_supported"]).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
    expect(metadata["client_id_metadata_document_supported"]).toBe(true);
  });

  it("publishes the protected resource metadata of the MCP endpoint", async () => {
    const metadata = await json<Metadata>("/.well-known/oauth-protected-resource/mcp");
    expect(metadata).toMatchObject({
      authorization_servers: [API_ORIGIN],
      bearer_methods_supported: ["header"],
      resource: `${API_ORIGIN}/mcp`,
    });
  });

  it("challenges an unauthenticated MCP call with the resource metadata URL", async () => {
    const response = await mcpCall(undefined, "initialize");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `resource_metadata="${API_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );
  });
});

describe("dynamic client registration", () => {
  it("registers a public PKCE client", async () => {
    const response = await call("/oauth/register", {
      body: {
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "none",
      },
    });
    expect(response.status).toBe(201);
    const registered = await readJson<Metadata>(response);
    expect(registered).toMatchObject({
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    });
    expect(registered["client_id"]).toEqual(expect.any(String));
    expect(registered["client_secret"]).toBeUndefined();
  });
});

describe("authorization", () => {
  it("sends GET /authorize to the web consent page with the query intact", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const query = authorizeQuery(clientId, challenge, { scope: "tasks:read tasks:write" });
    const response = await getAuthorize(query);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${env.WEB_ORIGIN}/oauth/authorize?${query}`);
  });

  it("answers an unknown client on /authorize without redirecting anywhere", async () => {
    const { challenge } = await pkce();
    const response = await getAuthorize(authorizeQuery("nope", challenge));
    expect(response.status).toBe(400);
    expect(await readJson<Problem>(response)).toMatchObject({ code: "oauth/invalid-request" });
  });

  it("describes the client and the requested scopes for the consent page", async () => {
    const { clientId } = await registerClient({
      client_name: "Cursor",
      logo_uri: "https://cursor.com/logo.png",
    });
    const { challenge } = await pkce();
    const query = authorizeQuery(clientId, challenge, { scope: "tasks:write profile" });
    const info = await json<Metadata>(
      `/api/oauth/client-info?authQuery=${encodeURIComponent(query)}`,
    );
    expect(info).toEqual({
      clientDomain: null,
      clientName: "Cursor",
      clientUri: null,
      logoUri: "https://cursor.com/logo.png",
      redirectHost: "localhost",
      redirectIsLoopback: true,
      scopes: ["tasks:write"],
    });
  });

  it("offers every scope when the client asked for none", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const query = authorizeQuery(clientId, challenge);
    const info = await json<{ scopes: string[] }>(
      `/api/oauth/client-info?authQuery=${encodeURIComponent(query)}`,
    );
    expect(info.scopes).toEqual([...OAUTH_SCOPES]);
  });

  it("runs the PKCE S256 code flow end to end and reaches the MCP server", async () => {
    const { clientId } = await registerClient();
    const { challenge, verifier } = await pkce();
    const query = authorizeQuery(clientId, challenge, {
      scope: "tasks:read offline_access",
      state: "xyz",
    });

    const consent = await completeConsent(query, ["tasks:read", "offline_access"]);
    expect(consent.status).toBe(200);
    const { redirectTo } = await readJson<Redirect>(consent);
    const redirect = new URL(redirectTo);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT_URI);
    expect(redirect.searchParams.get("state")).toBe("xyz");
    expect(redirect.searchParams.get("iss")).toBe(API_ORIGIN);

    const tokens = await exchangeCode({ clientId, code: codeFrom(redirectTo), verifier });
    expect(tokens).toMatchObject({
      expires_in: 86_400,
      resource: `${API_ORIGIN}/mcp`,
      scope: "tasks:read offline_access",
      token_type: "bearer",
    });
    expect(tokens.refresh_token).toEqual(expect.any(String));

    const response = await mcpCall(tokens.access_token, "initialize", {
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
      protocolVersion: "2025-06-18",
    });
    expect(response.status).toBe(200);
    expect(await readJson<{ result: { serverInfo: { name: string } } }>(response)).toMatchObject({
      result: { serverInfo: { name: "pace" } },
    });
  });

  it("refuses a code with the wrong PKCE verifier", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const consent = await completeConsent(authorizeQuery(clientId, challenge), ["tasks:read"]);
    const { redirectTo } = await readJson<Redirect>(consent);
    const response = await tokenRequest({
      client_id: clientId,
      code: codeFrom(redirectTo),
      code_verifier: "not-the-verifier-at-all-not-the-verifier-at-all",
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    });
    expect(response.status).toBe(400);
    expect(await readJson<{ error: string }>(response)).toMatchObject({ error: "invalid_grant" });
  });

  it("rotates the refresh token on every refresh", async () => {
    const { clientId, tokens } = await obtainToken({
      scope: "tasks:read offline_access",
      scopes: ["tasks:read", "offline_access"],
    });
    const refreshed = await tokenRequest({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
    });
    expect(refreshed.status).toBe(200);
    const next = await readJson<{ access_token: string; refresh_token: string }>(refreshed);
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.refresh_token).not.toBe(tokens.refresh_token);

    const again = await tokenRequest({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: next.refresh_token,
    });
    expect(again.status).toBe(200);
    // The new token works; the one it replaced is gone once its successor has been used.
    const stale = await tokenRequest({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
    });
    expect(stale.status).toBe(400);
  });

  it("refuses a Telegram id outside the whitelist with 403 and stores nothing", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const grantsBefore = (await env.OAUTH_KV.list({ prefix: "grant:" })).keys.length;
    const consent = await completeConsent(
      authorizeQuery(clientId, challenge),
      ["tasks:read"],
      "4242",
    );
    expect(consent.status).toBe(403);
    expect(await readJson<Problem>(consent)).toMatchObject({ code: "auth/not-allowed" });
    expect((await env.OAUTH_KV.list({ prefix: "grant:" })).keys).toHaveLength(grantsBefore);
  });

  it("rejects scopes the client did not request", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const query = authorizeQuery(clientId, challenge, { scope: "tasks:read" });
    const consent = await completeConsent(query, ["tasks:read", "tasks:write"]);
    expect(consent.status).toBe(422);
    expect(await readJson<Problem>(consent)).toMatchObject({ code: "oauth/scope-not-requested" });
  });

  it("requires an identity: no widget payload and no dev id is 422", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const response = await call("/api/oauth/complete", {
      body: { authQuery: authorizeQuery(clientId, challenge), scopes: ["tasks:read"] },
    });
    expect(response.status).toBe(422);
    expect(await readJson<Problem>(response)).toMatchObject({ code: "auth/identity-required" });
  });

  it("sends the client access_denied when the person declines", async () => {
    const { clientId } = await registerClient();
    const { challenge } = await pkce();
    const query = authorizeQuery(clientId, challenge, { state: "s-deny" });
    const denied = await json<Redirect>("/api/oauth/deny", { body: { authQuery: query } });
    const redirect = new URL(denied.redirectTo);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT_URI);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("s-deny");
    expect(redirect.searchParams.get("code")).toBeNull();
  });
});

describe("grants", () => {
  it("needs a session bearer to list and to revoke", async () => {
    expect(endpoints.oauth.grants.list.auth).toBe(true);
    expect(endpoints.oauth.grants.revoke.auth).toBe(true);
    expect((await call("/api/oauth/grants")).status).toBe(401);
    expect((await revokeGrant("g1")).status).toBe(401);
    expect((await revokeGrant("g1", "nope")).status).toBe(401);
  });

  it("lists the person's grants with the client name and revoking one kills its token", async () => {
    // Telegram id 1002 is used by this test alone: KV is shared by the whole file.
    const { tokens } = await obtainToken({ devTelegramId: "1002" });
    const session = await loginAsDev("1002");
    const listed = await json<{ grants: Metadata[] }>("/api/oauth/grants", { token: session });
    expect(listed.grants).toHaveLength(1);
    const [grant] = listed.grants;
    expect(grant).toMatchObject({
      clientName: "Test MCP client",
      logoUri: null,
      scopes: ["tasks:read"],
    });
    expect(grant?.["createdAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const other = await loginAsDev("1001");
    const othersGrants = await json<{ grants: Metadata[] }>("/api/oauth/grants", { token: other });
    expect(othersGrants.grants.map((item) => item["id"])).not.toContain(grant?.["id"]);

    const revoked = await revokeGrant(String(grant?.["id"]), session);
    expect(revoked.status).toBe(200);
    expect(await readJson<{ ok: boolean }>(revoked)).toEqual({ ok: true });
    expect((await mcpCall(tokens.access_token, "initialize")).status).toBe(401);
    expect(await json<{ grants: Metadata[] }>("/api/oauth/grants", { token: session })).toEqual({
      grants: [],
    });
  });
});
