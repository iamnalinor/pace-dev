import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { endpoints, newId } from "@pace/core";

import type { TelegramTransport } from "../src/shared/telegram-api.ts";

import { expireConfirmation } from "../src/account/account-routes.ts";
import { createApp } from "../src/app.ts";
import { accountConfirmations } from "../src/shared/db/d1-schema.ts";
import { d1 } from "../src/shared/db/d1.ts";
import { answerOf, call, json, loginAsDev, pushEvents, storeIdOf } from "./helpers.ts";

const sent: { method: string; body: Record<string, unknown> }[] = [];
const telegramFetch: TelegramTransport = async (input, init) => {
  sent.push({
    method: String(input).split("/").at(-1) ?? "",
    body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>,
  });
  return Response.json({ ok: true, result: { message_id: sent.length } });
};

const app = createApp({
  fetch: async () => {
    throw new Error("network disabled");
  },
  parseProviders: () => [],
  telegramFetch,
});

const request = async (
  path: string,
  options: { token?: string; body?: unknown; method?: string } = {},
) => {
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request(`https://pace-api.test${path}`, {
      body: options.body === undefined ? null : JSON.stringify(options.body),
      headers: {
        "Content-Type": "application/json",
        ...(path === "/telegram/webhook" && {
          // eslint-disable-next-line sonarjs/no-hardcoded-ip -- Telegram's fixture subnet for the webhook gate
          "CF-Connecting-IP": "149.154.167.220",
          "X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret",
        }),
        ...(options.token !== undefined && { Authorization: `Bearer ${options.token}` }),
      },
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
};

const telegramUpdate = async (telegramId: number, data: string) =>
  await request("/telegram/webhook", {
    body: {
      callback_query: {
        id: newId(),
        chat_instance: "test",
        data,
        from: { id: telegramId, is_bot: false, first_name: "Ada" },
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: telegramId, type: "private" },
          text: "Confirm?",
        },
      },
      update_id: Date.now(),
    },
  });

describe("Telegram account confirmations", () => {
  it("keeps only one pending request of each kind when requests overlap", async () => {
    const token = await loginAsDev("1001");
    const [firstResponse, secondResponse] = await Promise.all([
      request("/api/account/confirmations", { token, body: { action: "wipe" } }),
      request("/api/account/confirmations", { token, body: { action: "wipe" } }),
    ]);
    const first = endpoints.account.createConfirmation.output.parse(await firstResponse.json());
    const second = endpoints.account.createConfirmation.output.parse(await secondResponse.json());
    const statuses = await Promise.all(
      [first.id, second.id].map(
        async (id) =>
          endpoints.account.confirmationStatus.output.parse(
            await (await request(`/api/account/confirmations/${id}`)).json(),
          ).status,
      ),
    );
    expect(new Set(statuses)).toEqual(new Set(["pending", "replaced"]));
  });

  it("does not report a processing confirmation as cancelled", async () => {
    const token = await loginAsDev("1001");
    const created = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "wipe" } })
      ).json(),
    );
    await d1(env.DB)
      .update(accountConfirmations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(accountConfirmations.id, created.id));
    const stalePending = await d1(env.DB).query.accountConfirmations.findFirst({
      where: eq(accountConfirmations.id, created.id),
    });
    expect(stalePending?.status).toBe("pending");
    await d1(env.DB)
      .update(accountConfirmations)
      .set({ status: "processing" })
      .where(eq(accountConfirmations.id, created.id));
    if (stalePending === undefined) {
      throw new Error("missing confirmation");
    }
    expect((await expireConfirmation(env.DB, stalePending)).status).toBe("processing");
    const polling = endpoints.account.confirmationStatus.output.parse(
      await (await request(`/api/account/confirmations/${created.id}`)).json(),
    );
    expect(polling.status).toBe("pending");
    const cancelled = endpoints.account.cancelConfirmation.output.parse(
      await (
        await request(`/api/account/confirmations/${created.id}/cancel`, { token, method: "POST" })
      ).json(),
    );
    expect(cancelled.status).toBe("pending");
  });

  it("wipes only after the owner confirms, keeps sessions, and changes store id", async () => {
    sent.length = 0;
    const token = await loginAsDev("1001");
    const before = await storeIdOf(token);
    await pushEvents(token, [
      {
        deviceId: "test",
        id: newId(),
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        precision: "exact",
        source: "app",
        type: "task.created",
        payload: { taskId: newId(), title: "Sample", presetId: "work", fields: {}, subtasks: [] },
      },
    ]);
    const created = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "wipe" } })
      ).json(),
    );
    expect(sent.at(-1)?.method).toBe("sendMessage");
    expect(JSON.stringify(sent.at(-1)?.body)).toContain(`account:confirm:${created.id}`);
    expect((await telegramUpdate(1002, `account:confirm:${created.id}`)).status).toBe(200);
    expect(
      (
        await answerOf(
          endpoints.account.confirmationStatus,
          `/api/account/confirmations/${created.id}`,
        )
      ).status,
    ).toBe("pending");
    expect((await telegramUpdate(1001, `account:confirm:${created.id}`)).status).toBe(200);
    expect(
      (
        await answerOf(
          endpoints.account.confirmationStatus,
          `/api/account/confirmations/${created.id}`,
        )
      ).status,
    ).toBe("confirmed");
    expect(await storeIdOf(token)).not.toBe(before);
    expect((await json<{ events: unknown[] }>("/api/sync/pull", { token })).events).toEqual([]);
  });

  it("deletes after confirmation and permits terminal polling without the old session", async () => {
    sent.length = 0;
    const token = await loginAsDev("1002");
    const created = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "delete" } })
      ).json(),
    );
    expect((await telegramUpdate(1002, `account:confirm:${created.id}`)).status).toBe(200);
    expect((await call("/api/me", { token })).status).toBe(401);
    const status = await request(`/api/account/confirmations/${created.id}`);
    expect(endpoints.account.confirmationStatus.output.parse(await status.json()).status).toBe(
      "confirmed",
    );
  });
});
