import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { endpoint, endpoints } from "@pace/core";

import { ApiError, createApiClient } from "./api-client.ts";

const jsonResponse = (status: number, body: unknown): Response =>
  Response.json(body, {
    headers: { "Content-Type": "application/json" },
    status,
  });

describe("createApiClient", () => {
  it("sends the bearer token and parses the declared output", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: "ok" }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      token: () => "secret",
    });
    await expect(client.call(endpoints.health, {})).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/health", {
      headers: { Accept: "application/json", Authorization: "Bearer secret" },
      method: "GET",
    });
  });

  it("turns error bodies into ApiError with the server's code", async () => {
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: async () => jsonResponse(403, { code: "auth/not-allowed", message: "Nope" }),
      token: () => undefined,
    });
    const call = client.call(endpoints.health, {});
    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toMatchObject({
      code: "auth/not-allowed",
      message: "Nope",
      status: 403,
    });
  });

  it("rejects responses that do not match the contract", async () => {
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: async () => jsonResponse(200, { status: "weird" }),
      token: () => undefined,
    });
    await expect(client.call(endpoints.health, {})).rejects.toThrow();
  });
});

describe("createApiClient request shaping", () => {
  const bodyEndpoint = endpoint({
    auth: true,
    body: z.object({ title: z.string() }),
    method: "POST",
    output: z.object({ id: z.string() }),
    params: z.object({ projectId: z.string() }),
    path: "/api/projects/:projectId/tasks",
    query: z.object({ dryRun: z.string() }),
  });

  it("substitutes params, appends the query and sends the JSON body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: "t1" }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      token: () => undefined,
    });
    await expect(
      client.call(bodyEndpoint, {
        body: { title: "Write tests" },
        params: { projectId: "p 1" },
        query: { dryRun: "1" },
      }),
    ).resolves.toEqual({ id: "t1" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/projects/p%201/tasks?dryRun=1", {
      body: JSON.stringify({ title: "Write tests" }),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      method: "POST",
    });
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: async () => new Response("boom", { status: 502, statusText: "Bad Gateway" }),
      token: () => undefined,
    });
    await expect(client.call(endpoints.health, {})).rejects.toMatchObject({
      code: "unknown",
      message: "Bad Gateway",
      status: 502,
    });
  });
});

describe("createApiClient default transport", () => {
  it("uses the global fetch when none is injected", async () => {
    const globalFetch = vi.fn(async () => jsonResponse(200, { status: "ok" }));
    vi.stubGlobal("fetch", globalFetch);
    try {
      const client = createApiClient({ baseUrl: "https://api.test", token: () => undefined });
      await expect(client.call(endpoints.health, {})).resolves.toEqual({ status: "ok" });
      expect(globalFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
