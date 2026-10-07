import { expect } from "vitest";

import { randomBase64Url } from "../src/shared/crypto.ts";
import { api, call, readJson } from "./helpers.ts";

/** The Worker's own origin in workerd (what every test request is addressed to). */
export const API_ORIGIN = "https://pace-api.test";

/** A loopback callback, as MCP clients on a laptop use (Claude Code, Cursor, MCP Inspector). */
export const REDIRECT_URI = "http://localhost:6274/oauth/callback";

export type Pkce = { readonly verifier: string; readonly challenge: string };

const base64UrlOf = (bytes: ArrayBuffer): string =>
  btoa(String.fromCodePoint(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

/** PKCE S256: `challenge = base64url(sha256(verifier))`. */
export const pkce = async (): Promise<Pkce> => {
  const verifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { challenge: base64UrlOf(digest), verifier };
};

/** Dynamic client registration of a public (PKCE) client, the way MCP clients do it. */
export const registerClient = async (
  metadata: Record<string, unknown> = {},
): Promise<{ readonly clientId: string }> => {
  const response = await call("/oauth/register", {
    body: {
      client_name: "Test MCP client",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [REDIRECT_URI],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...metadata,
    },
  });
  expect(response.status).toBe(201);
  const registered = await readJson<{ client_id: string }>(response);
  return { clientId: registered.client_id };
};

/** The query string of an authorization request (what `GET /authorize?…` receives). */
export const authorizeQuery = (
  clientId: string,
  challenge: string,
  options: { readonly scope?: string; readonly state?: string } = {},
): string =>
  new URLSearchParams({
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: REDIRECT_URI,
    resource: `${API_ORIGIN}/mcp`,
    response_type: "code",
    state: options.state ?? "state-1",
    ...(options.scope !== undefined && { scope: options.scope }),
  }).toString();

/**
 * `GET /authorize` without following its redirect: the loopback fetch would otherwise follow
 * the 302 to the web origin, which lands back in this Worker as a 404.
 */
export const getAuthorize = async (query: string): Promise<Response> =>
  await api.fetch(new Request(`${API_ORIGIN}/authorize?${query}`, { redirect: "manual" }));

/** The consent page's "Allow" as the dev login path: the API answers `{ redirectTo }`. */
export const completeConsent = async (
  authQuery: string,
  scopes: readonly string[],
  devTelegramId = "1001",
): Promise<Response> =>
  await call("/api/oauth/complete", { body: { authQuery, devTelegramId, scopes } });

/** Reads the authorization code out of the client redirect the consent step produced. */
export const codeFrom = (redirectTo: string): string => {
  const code = new URL(redirectTo).searchParams.get("code");
  expect(code).not.toBeNull();
  return code ?? "";
};

export type TokenResponse = {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope: string;
  readonly token_type: string;
  readonly resource: string;
};

/** The token endpoint speaks `application/x-www-form-urlencoded`, not JSON. */
export const tokenRequest = async (form: Record<string, string>): Promise<Response> =>
  await api.fetch(
    new Request(`${API_ORIGIN}/oauth/token`, {
      body: new URLSearchParams(form).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    }),
  );

export const exchangeCode = async (input: {
  readonly clientId: string;
  readonly code: string;
  readonly verifier: string;
}): Promise<TokenResponse> => {
  const response = await tokenRequest({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.verifier,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });
  expect(response.status).toBe(200);
  return await readJson<TokenResponse>(response);
};

/** The whole dance up to an access token: register → authorize → consent (dev id) → exchange. */
export const obtainToken = async (
  options: {
    readonly scope?: string;
    readonly scopes?: readonly string[];
    readonly devTelegramId?: string;
  } = {},
): Promise<{ readonly clientId: string; readonly tokens: TokenResponse }> => {
  const { clientId } = await registerClient();
  const { challenge, verifier } = await pkce();
  const query = authorizeQuery(clientId, challenge, { scope: options.scope ?? "tasks:read" });
  const consent = await completeConsent(
    query,
    options.scopes ?? ["tasks:read"],
    options.devTelegramId,
  );
  expect(consent.status).toBe(200);
  const { redirectTo } = await readJson<{ redirectTo: string }>(consent);
  const tokens = await exchangeCode({ clientId, code: codeFrom(redirectTo), verifier });
  return { clientId, tokens };
};

/** `DELETE /api/oauth/grants/:id` (tests/helpers.ts only speaks GET and POST). */
export const revokeGrant = async (id: string, token?: string): Promise<Response> =>
  await api.fetch(
    new Request(`${API_ORIGIN}/api/oauth/grants/${id}`, {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
      method: "DELETE",
    }),
  );

/** One JSON-RPC call to the MCP endpoint (stateless streamable HTTP, JSON responses). */
export const mcpCall = async (
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Response> =>
  await api.fetch(
    new Request(`${API_ORIGIN}/mcp`, {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(token !== undefined && { Authorization: `Bearer ${token}` }),
      },
      method: "POST",
    }),
  );

export type JsonRpcResult<T> = {
  readonly result: T;
  readonly error?: { readonly message: string };
};

export const mcpResult = async <T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> => {
  const response = await mcpCall(token, method, params);
  expect(response.status).toBe(200);
  const body = await readJson<JsonRpcResult<T>>(response);
  expect(body.error).toBeUndefined();
  return body.result;
};
