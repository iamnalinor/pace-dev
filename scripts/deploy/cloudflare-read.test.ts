import { describe, expect, test } from "bun:test";

import {
  deployment,
  deploymentId,
  fixture,
  otherVersionId,
  success,
  target,
  versionId,
  worker,
} from "./cloudflare-read.fixtures.ts";
import { createCloudflareReader } from "./cloudflare-read.ts";

const json = (value: unknown, status = 200) => Response.json(value, { status });

const snapshotReply = (url: string, replacements: Readonly<Record<string, unknown>>): Response => {
  if (url.endsWith(`/accounts/${target.accountId}`)) {
    return json(success({ id: target.accountId }));
  }
  if (url.endsWith("/deployments")) {
    return json(success(replacements["deployments"]));
  }
  if (url.endsWith("/versions")) {
    return json(success(replacements["versions"]));
  }
  return json(success(replacements["worker"] ?? worker));
};

describe("authenticated Cloudflare snapshot reads", () => {
  test("reads authenticated account, worker, current deployment and independent latest version", async () => {
    const f = fixture();
    expect(await f.reader.readSnapshot(target)).toEqual({
      ok: true,
      value: {
        status: "existing",
        ...target,
        active: [{ versionId, percentage: 100 }],
        latestVersionId: versionId,
        deploymentId,
      },
    });
    expect(f.calls.map(({ url }) => url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}`,
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/workers/pace-worker`,
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/pace-worker/deployments`,
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/pace-worker/versions`,
    ]);
    for (const { init } of f.calls) {
      expect(init.method).toBe("GET");
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer SECRET_API_TOKEN");
    }
  });
  test("preserves split traffic and latest drift for pure preflight rejection", async () => {
    const f = fixture((url) =>
      snapshotReply(url, {
        deployments: {
          deployments: [
            {
              ...deployment,
              versions: [
                { version_id: versionId, percentage: 50 },
                { version_id: otherVersionId, percentage: 50 },
              ],
            },
          ],
        },
        versions: { items: [{ id: otherVersionId, number: 3 }] },
      }),
    );
    expect(await f.reader.readSnapshot(target)).toMatchObject({
      ok: true,
      value: {
        active: [
          { versionId, percentage: 50 },
          { versionId: otherVersionId, percentage: 50 },
        ],
        latestVersionId: otherVersionId,
      },
    });
  });
  test("confirmed absence requires successful account authorization then exact Worker-not-found", async () => {
    const f = fixture((url) =>
      url.endsWith(`/accounts/${target.accountId}`)
        ? json(success({ id: target.accountId }))
        : json(
            {
              success: false,
              errors: [{ code: 10_007, message: "secret diagnostic" }],
              result: null,
            },
            404,
          ),
    );
    expect(await f.reader.readSnapshot(target)).toEqual({
      ok: true,
      value: { status: "absent", ...target },
    });
    expect(f.calls).toHaveLength(2);
  });
  test.each([401, 403, 404, 500])("account HTTP %i never becomes absence", async (status) => {
    const f = fixture(() => json({ success: false, errors: [{ code: 10_007 }] }, status));
    expect((await f.reader.readSnapshot(target)).ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });
  test.each([
    { success: false, errors: [{ code: 10_000 }] },
    { success: false, errors: [{ code: 10_007 }, { code: 10_000 }] },
    { success: true, errors: [], result: null },
    {},
    null,
  ])("Worker 404 payload %# never becomes absence", async (body) => {
    const f = fixture((url) =>
      url.endsWith(`/accounts/${target.accountId}`)
        ? json(success({ id: target.accountId }))
        : json(body, 404),
    );
    expect((await f.reader.readSnapshot(target)).ok).toBe(false);
  });
  test.each([
    {},
    { deployments: [] },
    { deployments: [{ ...deployment, versions: [] }] },
    { deployments: [{ ...deployment, versions: [{ version_id: "bad", percentage: 100 }] }] },
  ])("rejects malformed or empty deployment %#", async (body) => {
    const f = fixture((url) => snapshotReply(url, { deployments: body }));
    expect((await f.reader.readSnapshot(target)).ok).toBe(false);
  });
  test("rejects account/worker identity mismatches and wrong caller targets", async () => {
    const account = fixture(() => json(success({ id: "other" })));
    expect((await account.reader.readSnapshot(target)).ok).toBe(false);
    const wrong = fixture((url) =>
      json(
        success(
          url.endsWith(`/accounts/${target.accountId}`)
            ? { id: target.accountId }
            : { ...worker, name: "foreign-worker" },
        ),
      ),
    );
    expect((await wrong.reader.readSnapshot(target)).ok).toBe(false);
    const f = fixture();
    expect((await f.reader.readSnapshot({ ...target, workerName: "other" })).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  test("rejects empty latest versions and never reads secrets", async () => {
    const f = fixture((url) =>
      snapshotReply(url, {
        deployments: { deployments: [deployment] },
        versions: { items: [] },
      }),
    );
    expect((await f.reader.readSnapshot(target)).ok).toBe(false);
    expect(f.calls.every(({ url }) => !url.includes("secrets"))).toBe(true);
  });
  test.each([301, 302, 307, 308])(
    "rejects redirect %i without credential forwarding",
    async (status) => {
      const f = fixture(
        () => new Response(null, { status, headers: { Location: "https://foreign.example" } }),
      );
      expect((await f.reader.readSnapshot(target)).ok).toBe(false);
      expect(f.calls).toHaveLength(1);
    },
  );
  test("sanitizes malformed JSON, thrown errors and invalid credentials", async () => {
    const f = fixture(() => new Response("SECRET_API_TOKEN"));
    expect(JSON.stringify(await f.reader.readSnapshot(target))).not.toContain("SECRET");
    const thrown = fixture(() => {
      throw new Error("SECRET_API_TOKEN");
    });
    expect(await thrown.reader.readSnapshot(target)).toEqual({ ok: false, error: "transport" });
    const invalid = createCloudflareReader({ ...f.config, apiToken: "token\ninjection" });
    expect((await invalid.readSnapshot(target)).ok).toBe(false);
  });
});
