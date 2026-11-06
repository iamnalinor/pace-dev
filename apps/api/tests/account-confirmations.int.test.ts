import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { endpoints, newId } from "@pace/core";

import type { TelegramTransport } from "../src/shared/telegram-api.ts";

import { expireConfirmation } from "../src/account/account-routes.ts";
import { d1 } from "../src/platform/cloudflare/sqlite.ts";
import {
  claimAccountCleanup,
  prepareAccountCleanup,
} from "../src/shared/account-cleanup-repository.ts";
import { accountCleanupOperations, accountConfirmations } from "../src/shared/db/d1-schema.ts";
import worker from "../src/worker.ts";
import { answerOf, call, json, loginAsDev, pushEvents, storeIdOf } from "./helpers.ts";
import { createApp } from "./host.ts";

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
    await prepareAccountCleanup(d1(env.DB), {
      operationId: created.id,
      userId: stalePending.userId,
      action: "wipe",
      now: new Date(),
    });
    await claimAccountCleanup(d1(env.DB), created.id, new Date());
    expect((await expireConfirmation(d1(env.DB), stalePending)).status).toBe("processing");
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
    // Finish this deliberately held request so the shared owner is available to later tests.
    await d1(env.DB)
      .update(accountCleanupOperations)
      .set({ leaseUntil: new Date(0) })
      .where(eq(accountCleanupOperations.id, created.id));
    const recovered = endpoints.account.confirmationStatus.output.parse(
      await (await request(`/api/account/confirmations/${created.id}`)).json(),
    );
    expect(recovered.status).toBe("confirmed");
  });

  it("recovers a processing confirmation whose request crashed before journal creation", async () => {
    const token = await loginAsDev("1001");
    const before = await storeIdOf(token);
    const created = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "wipe" } })
      ).json(),
    );
    await d1(env.DB)
      .update(accountConfirmations)
      .set({ status: "processing", expiresAt: new Date(0) })
      .where(eq(accountConfirmations.id, created.id));
    const status = endpoints.account.confirmationStatus.output.parse(
      await (await request(`/api/account/confirmations/${created.id}`)).json(),
    );
    expect(status.status).toBe("confirmed");
    const after = await storeIdOf(token);
    expect(after).not.toBe(before);
    await request(`/api/account/confirmations/${created.id}`);
    expect(await storeIdOf(token)).toBe(after);
  });

  it("reconciles a crashed processing deletion through scheduled maintenance without an old session", async () => {
    const token = await loginAsDev("1002");
    const created = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "delete" } })
      ).json(),
    );
    await d1(env.DB)
      .update(accountConfirmations)
      .set({ status: "processing" })
      .where(eq(accountConfirmations.id, created.id));
    const context = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, context);
    await waitOnExecutionContext(context);
    expect((await call("/api/me", { token })).status).toBe(401);
    const status = endpoints.account.confirmationStatus.output.parse(
      await (await request(`/api/account/confirmations/${created.id}`)).json(),
    );
    expect(status.status).toBe("confirmed");
  });

  it("does not alias a second confirmed request to an active cleanup or later wipe newer data", async () => {
    const token = await loginAsDev("1001");
    const first = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "wipe" } })
      ).json(),
    );
    const firstRow = await d1(env.DB).query.accountConfirmations.findFirst({
      where: eq(accountConfirmations.id, first.id),
    });
    if (firstRow === undefined) {
      throw new Error("missing confirmation");
    }
    await d1(env.DB)
      .update(accountConfirmations)
      .set({ status: "processing" })
      .where(eq(accountConfirmations.id, first.id));
    await prepareAccountCleanup(d1(env.DB), {
      operationId: first.id,
      userId: firstRow.userId,
      action: "wipe",
      now: new Date(),
    });
    await claimAccountCleanup(d1(env.DB), first.id, new Date());
    const second = endpoints.account.createConfirmation.output.parse(
      await (
        await request("/api/account/confirmations", { token, body: { action: "wipe" } })
      ).json(),
    );
    await telegramUpdate(1001, `account:confirm:${second.id}`);
    expect(
      (
        await d1(env.DB).query.accountConfirmations.findFirst({
          where: eq(accountConfirmations.id, second.id),
        })
      )?.status,
    ).toBe("pending");
    await d1(env.DB)
      .update(accountCleanupOperations)
      .set({ leaseUntil: new Date(0) })
      .where(eq(accountCleanupOperations.id, first.id));
    await request(`/api/account/confirmations/${first.id}`);
    const generation = await storeIdOf(token);
    const now = new Date().toISOString();
    const event = {
      id: newId(),
      deviceId: "test",
      type: "task.created",
      occurredAt: now,
      recordedAt: now,
      source: "app",
      precision: "exact",
      payload: {
        taskId: newId(),
        title: "New generation",
        presetId: "work",
        fields: {},
        subtasks: [],
      },
    };
    await pushEvents(token, [event]);
    await request(`/api/account/confirmations/${second.id}`);
    await request(`/api/account/confirmations/${second.id}`);
    expect(await storeIdOf(token)).toBe(generation);
    expect(
      (await json<{ events: { id: string }[] }>("/api/sync/pull", { token })).events.map(
        (row) => row.id,
      ),
    ).toContain(event.id);
    const cancelled = endpoints.account.cancelConfirmation.output.parse(
      await (
        await request(`/api/account/confirmations/${second.id}/cancel`, { token, method: "POST" })
      ).json(),
    );
    expect(cancelled.status).toBe("cancelled");
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
