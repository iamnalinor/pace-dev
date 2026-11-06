import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { d1 } from "../src/platform/cloudflare/sqlite.ts";
import { subscribe } from "../src/shared/push-subscriptions.ts";
import { json, loginAsDev } from "./helpers.ts";
import { runInUserStore as runInDurableObject, UserStore } from "./host.ts";

/** A real signing key ensures a missing policy guard would reach the network. */
const serviceAccount = async (): Promise<string> => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  return JSON.stringify({
    client_email: "firebase-policy@example.test",
    private_key: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCodePoint(...bytes))}\n-----END PRIVATE KEY-----\n`,
    private_key_id: crypto.randomUUID(),
    project_id: "sender-project",
    token_uri: "https://oauth2.test/token",
  });
};

const mismatchedAndroid = JSON.stringify({
  project_info: { project_id: "another-project", project_number: "123" },
  client: [
    {
      client_info: {
        android_client_info: { package_name: "app.test" },
        mobilesdk_app_id: "app-id",
      },
      api_key: [{ current_key: "public-key" }],
    },
  ],
});

describe("Firebase policy in a real Durable Object notification send", () => {
  it.each([
    { label: "strict sender-only", policy: "strict", android: "", sends: 0 },
    { label: "strict mismatched pair", policy: "strict", android: mismatchedAndroid, sends: 0 },
    { label: "additive sender-only", policy: "additive", android: "", sends: 1 },
  ])("$label sends $sends FCM messages", async ({ policy, android, sends }) => {
    const token = await loginAsDev("1001");
    const { id: userId } = await json<{ id: string }>("/api/me", { token });
    const session = await env.DB.prepare(
      "SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId)
      .first<{ id: string }>();
    if (session === null) {
      throw new Error("Expected the signed-in session");
    }
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId).run();
    await subscribe(d1(env.DB), {
      endpoint: "policy-test-device",
      now: Date.now(),
      sessionId: session.id,
      transport: "fcm",
      userId,
    });
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(userId));
    await stub.wipe();
    const bindings = {
      ...env,
      FIREBASE_SERVICE_ACCOUNT: await serviceAccount(),
      FIREBASE_ANDROID_CONFIG: android,
      PACE_FIREBASE_CONFIG_POLICY: policy,
    };
    const outgoing: string[] = [];
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://oauth2.test/token") {
        outgoing.push(url);
        return Response.json({
          access_token: "test-access",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }
      if (url.startsWith("https://fcm.googleapis.com/")) {
        outgoing.push(url);
        return Response.json({ name: "projects/sender-project/messages/test" });
      }
      return await originalFetch(input, init);
    });
    try {
      await runInDurableObject(stub, async (_instance, state) => {
        const store = new UserStore(state, bindings);
        const now = new Date().toISOString();
        const result = await store.notify(
          {
            kind: "login",
            payload: {
              country: "Test",
              ip: "test-address",
              kind: "web",
              name: "Browser",
              sessionId: "new-sign-in",
            },
          },
          now,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) {
          throw new Error("Expected the login notification");
        }
        const page = await store.listNotifications({ limit: 5 });
        expect(page.deliveries[result.value.id]).toContainEqual(
          expect.objectContaining({
            method: "fcm",
            result: sends === 0 ? "failed" : "sent",
            reason: sends === 0 ? "unavailable" : null,
          }),
        );
        await state.storage.deleteAlarm();
      });
      expect(outgoing.filter((url) => url.startsWith("https://fcm.googleapis.com/"))).toHaveLength(
        sends,
      );
      expect(outgoing.filter((url) => url === "https://oauth2.test/token")).toHaveLength(sends);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
