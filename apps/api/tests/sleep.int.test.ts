import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  endpoints,
  formatInZone,
  isAutoSleepId,
  newId,
  sleepNightOf,
  wallClockInstant,
} from "@pace/core";

import { nextSleepCheckAt } from "../src/user-store/alarm.ts";
import { answerOf, call, json, loginAsDev, nonceLogin, pushEvents } from "./helpers.ts";

const MOSCOW = "Europe/Moscow";
const DAY_MS = 86_400_000;

const dayAfter = (date: string, days = 1): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
The latest Moscow night whose morning (09:30) is over: the store decides at the real clock, so
the fixtures are last night's, always within the 36 hours a pass reads.
*/
const NIGHT = ((): string => {
  const now = new Date().toISOString();
  const today = formatInZone(now, MOSCOW, "yyyy-MM-dd");
  const yesterday = dayAfter(today, -1);
  return wallClockInstant(today, "09:30", MOSCOW) <= now ? yesterday : dayAfter(today, -2);
})();

/** A Moscow wall-clock time in that night: `23:40` is its evening, `07:10` the next morning. */
const at = (hhmm: string): string =>
  wallClockInstant(Number(hhmm.slice(0, 2)) >= 12 ? NIGHT : dayAfter(NIGHT), hhmm, MOSCOW);

type Raw = Record<string, unknown>;

const envelope = (type: string, payload: Raw): Raw => {
  const now = new Date().toISOString();
  return {
    deviceId: "dev-1",
    id: newId(),
    occurredAt: now,
    payload,
    precision: "exact",
    recordedAt: now,
    source: "app",
    type,
  };
};

const storeOf = async (token: string) => {
  const me = await json<{ id: string }>("/api/me", { token });
  return env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
};

/**
An account in Moscow with nothing in it yet and the app signed in on a phone (an `app` session,
whose uploads bound what is known). Tests in a file share the store, so each empties it first.
*/
const phoneAccount = async (telegramId: string, settings: Raw = {}) => {
  const earlier = await loginAsDev(telegramId);
  await call("/api/test/account", { method: "DELETE", token: earlier });
  const token = await loginAsDev(telegramId);
  await pushEvents(token, [envelope("settings.updated", { timezone: MOSCOW, ...settings })]);
  const phone = await nonceLogin(telegramId, { deviceId: "phone-1", from: "app" });
  return { phone, store: await storeOf(token), token };
};

/** The phone's upload: its uses (Moscow wall clock) and how far it read. */
const upload = async (
  phone: string,
  uses: readonly (readonly [string, string])[],
  until: string,
): Promise<void> => {
  const body = {
    deviceId: "phone-1",
    deviceName: "Pixel 8",
    sessions: [],
    until: at(until),
    uses: uses.map(([from, to]) => ({ endAt: at(to), startAt: at(from) })),
  };
  expect((await call("/api/usage/sessions", { body, token: phone })).status).toBe(200);
};

/** Automatic sleep's events in the log, as a client pulls them (through the endpoint's schema). */
const sleepLog = async (token: string) =>
  (await answerOf(endpoints.sync.pull, "/api/sync/pull?limit=500", { token })).events.filter(
    (event) => isAutoSleepId(event.id),
  );

/** The effective sleeps, as the store answers its state now. */
const sleeps = async (store: Awaited<ReturnType<typeof storeOf>>) =>
  Object.values((await store.read(new Date().toISOString())).state.time.activities)
    .filter((activity) => activity.category === "sleep")
    .map(({ endAt, startAt }) => ({ endAt, startAt }));

const sleepDecisions = async (token: string) =>
  (await answerOf(endpoints.decisions.list, "/api/decisions?limit=50", { token })).decisions
    .filter((decision) => decision.kind === "sleep")
    .toReversed();

const alarmOf = async (store: Awaited<ReturnType<typeof storeOf>>) =>
  await runInDurableObject(store, async (_instance, state) => await state.storage.getAlarm());

describe("automatic sleep on the server", () => {
  it("opens the night at the last use and stops it at the morning's first, from the system", async () => {
    const { phone, token } = await phoneAccount("1001");
    await upload(phone, [["23:10", "23:40"]], "01:00");
    const opened = await sleepLog(token);
    const night = sleepNightOf(at("23:40"), MOSCOW);
    expect(opened).toEqual([
      expect.objectContaining({
        deviceId: "server",
        occurredAt: at("23:40"),
        source: "system",
        type: "activity.started",
      }),
    ]);
    expect(opened[0]?.id.startsWith(`auto:sleep-${night}:start-`)).toBe(true);
    await upload(phone, [["07:10", "07:25"]], "07:25");
    const stopped = await sleepLog(token);
    expect(stopped.map((event) => [event.type, event.occurredAt])).toEqual([
      ["activity.started", at("23:40")],
      ["activity.stopped", at("07:10")],
    ]);
  });

  it("stops at a short wake, then undoes the stop once the quiet after it is known", async () => {
    const { phone, store, token } = await phoneAccount("1002");
    await upload(phone, [["23:10", "23:40"]], "01:00");
    await upload(phone, [["03:00", "03:06"]], "03:20");
    const [, stop] = await sleepLog(token);
    expect(stop).toMatchObject({ occurredAt: at("03:00"), type: "activity.stopped" });
    await upload(phone, [], "05:00");
    const revoked = (await sleepLog(token)).at(-1);
    expect(revoked).toMatchObject({
      payload: { targetId: stop?.id },
      source: "system",
      type: "event.revoked",
    });
    expect(await sleeps(store)).toEqual([{ endAt: null, startAt: at("23:40") }]);
  });

  it("writes nothing more for the same uploads and alarms again (idempotent)", async () => {
    const { phone, store, token } = await phoneAccount("1001");
    await upload(phone, [["23:10", "23:40"]], "01:00");
    await upload(phone, [["07:10", "07:25"]], "07:25");
    const before = await sleepLog(token);
    await upload(phone, [["23:10", "23:40"]], "01:00");
    await upload(phone, [["07:10", "07:25"]], "07:25");
    expect(await runDurableObjectAlarm(store)).toBe(true);
    await runDurableObjectAlarm(store);
    expect(await sleepLog(token)).toEqual(before);
    expect(await sleepDecisions(token)).toHaveLength(2);
  });

  it("logs each decision with its rule, the instant it is about and what it relied on", async () => {
    const { phone, token } = await phoneAccount("1002");
    await upload(phone, [["23:10", "23:40"]], "01:00");
    await upload(phone, [["03:00", "03:06"]], "03:20");
    await upload(phone, [], "05:00");
    const rows = await sleepDecisions(token);
    expect(rows.map((row) => [row.rule, (row.inputs as { at: string }).at])).toEqual([
      ["sleep.open", at("23:40")],
      ["sleep.stop", at("03:00")],
      ["sleep.reopen", at("03:00")],
    ]);
    expect(rows[0]).toMatchObject({
      inputs: {
        knownUntil: at("01:00"),
        spells: [{ endAt: at("23:40"), startAt: at("23:10") }],
        zone: MOSCOW,
      },
      kind: "sleep",
      outcome: "applied",
    });
  });

  it("stops again under a new id after the person undid the automatic stop (class 38)", async () => {
    const { phone, store, token } = await phoneAccount("1001");
    await upload(phone, [["23:10", "23:40"]], "01:00");
    await upload(phone, [["07:10", "07:25"]], "07:25");
    const [, first] = await sleepLog(token);
    // Undone in History: they were still asleep at 07:10.
    await pushEvents(token, [envelope("event.revoked", { targetId: first?.id })]);
    expect(await sleeps(store)).toEqual([{ endAt: null, startAt: at("23:40") }]);
    // Up again after a rest longer than one spell's gaps: that is the morning.
    await upload(phone, [["09:00", "09:10"]], "09:15");
    const stops = (await sleepLog(token)).filter((event) => event.type === "activity.stopped");
    expect(stops.map((event) => event.occurredAt)).toEqual([at("07:10"), at("09:00")]);
    expect(stops[1]?.id).not.toBe(first?.id);
    expect(await sleeps(store)).toEqual([{ endAt: at("09:00"), startAt: at("23:40") }]);
    const settled = await sleepLog(token);
    await runDurableObjectAlarm(store);
    expect(await sleepLog(token)).toEqual(settled);
  });
});

describe("the store's alarm for automatic sleep", () => {
  it("looks again within 15 minutes at night, at 21:00 by day, and again after each alarm", async () => {
    // No digest windows: nothing else the store waits on, so the alarm is sleep's own.
    const { phone, store } = await phoneAccount("1002", { digestWindows: [] });
    expect(await alarmOf(store)).toBeNull();
    const before = new Date().toISOString();
    await upload(phone, [["23:10", "23:40"]], "01:00");
    const after = new Date().toISOString();
    const armed = (await alarmOf(store)) ?? 0;
    expect(armed).toBeGreaterThanOrEqual(nextSleepCheckAt(before, MOSCOW));
    expect(armed).toBeLessThanOrEqual(nextSleepCheckAt(after, MOSCOW));
    // The alarm takes itself off as it runs; the pass arms the next look again.
    const fired = new Date().toISOString();
    await runDurableObjectAlarm(store);
    const again = (await alarmOf(store)) ?? 0;
    expect(again).toBeGreaterThanOrEqual(nextSleepCheckAt(fired, MOSCOW));
    expect(again).toBeLessThanOrEqual(nextSleepCheckAt(new Date().toISOString(), MOSCOW));
  });

  it("keeps an earlier wait of the assistant's queue: nothing moves it later", async () => {
    const { phone, store } = await phoneAccount("1001");
    const now = new Date().toISOString();
    const retryAt = new Date(Date.parse(now) + 2 * 60_000).toISOString();
    await store.enqueueParse({ channel: "api", retryAt, text: "позвонить в банк" }, now);
    expect(await alarmOf(store)).toBe(Date.parse(retryAt));
    await upload(phone, [["23:10", "23:40"]], "01:00");
    expect(await alarmOf(store)).toBe(Date.parse(retryAt));
  });

  it("keeps the queue's earlier wait through a pass of the pool with nothing due", async () => {
    const { store } = await phoneAccount("1002", { digestWindows: [] });
    const now = new Date().toISOString();
    const retryAt = new Date(Date.parse(now) + 2 * 60_000).toISOString();
    await store.enqueueParse({ channel: "api", retryAt, text: "купить хлеб" }, now);
    const run = await store.runNotifications(now);
    expect(run.nextAt).toBeNull();
    expect(await alarmOf(store)).toBe(Date.parse(retryAt));
  });

  it("decides nothing and arms nothing without a phone's upload", async () => {
    const { store, token } = await phoneAccount("1002");
    const computer = await answerOf(endpoints.sessions.createAgent, "/api/sessions/agents", {
      body: { name: "Linux Mint" },
      token,
    });
    const body = {
      deviceId: "laptop",
      deviceName: "Linux Mint",
      sessions: [{ app: "code", endAt: at("23:40"), startAt: at("23:10") }],
    };
    // Whatever the store waits on already (the pool's next digest window) stays as it was.
    const before = await alarmOf(store);
    await call("/api/usage/sessions", { body, token: computer.token });
    expect(await sleepLog(token)).toEqual([]);
    expect(await alarmOf(store)).toBe(before);
  });
});
