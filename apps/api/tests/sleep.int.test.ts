import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  endpoints,
  formatInZone,
  isAutoSleepId,
  newId,
  sleepNightOf,
  wallClockInstant,
} from "@pace/core";

import { SLEEP_NEXT_AT_KEY } from "../src/user-store/sleep-pass.ts";
import { answerOf, call, json, loginAsDev, nonceLogin, pushEvents } from "./helpers.ts";

const MOSCOW = "Europe/Moscow";
/** The night the fixtures use (Moscow: its evening and the next day), and 15:00 that next day. */
const NIGHT = "2099-10-07";
const NEXT_DAY = "2099-10-08";
const AFTERNOON = wallClockInstant(NEXT_DAY, "15:00", MOSCOW);

/**
The store's clock, frozen at `AFTERNOON` (only `Date` is faked, inside the Worker too). It lies far
ahead of the real clock, which workerd's own alarm scheduler keeps: an alarm the store arms is never
due for the runtime, so it runs only when a test fires it, never on its own alongside (a race that
left the alarm unset mid-pass, bug-lessons 2026-11-01).
*/
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AFTERNOON));
});

afterEach(() => {
  vi.useRealTimers();
});

/** A Moscow wall-clock time in that night: `23:40` is its evening, `07:10` the next morning. */
const at = (hhmm: string): string =>
  wallClockInstant(Number(hhmm.slice(0, 2)) >= 12 ? NIGHT : NEXT_DAY, hhmm, MOSCOW);

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

type Store = Awaited<ReturnType<typeof storeOf>>;

/** Sleep's next look is due now (the store's clock), with the alarm set for it. */
const sleepDueNow = async (store: Store): Promise<void> => {
  await runInDurableObject(store, async (_instance, state) => {
    await state.storage.put(SLEEP_NEXT_AT_KEY, Date.now());
    await state.storage.setAlarm(Date.now());
  });
};

/** Fires the store's alarm, which must be set: one that is not means a test lost track of it. */
const fireAlarm = async (store: Store): Promise<void> => {
  expect(await runDurableObjectAlarm(store)).toBe(true);
};

const alarmOf = async (store: Store) =>
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
    await fireAlarm(store);
    await fireAlarm(store);
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
    await fireAlarm(store);
    expect(await sleepLog(token)).toEqual(settled);
  });
});

describe("automatic sleep and the person's own records, through the store", () => {
  it("settles a night the person started work in from a browser: the log stops changing (C1)", async () => {
    const { phone, store, token } = await phoneAccount("1001", { digestWindows: [] });
    // The phone is put away at 22:40 and tells every 15 minutes; the night opens at 22:40.
    vi.setSystemTime(new Date(at("23:30")));
    await upload(phone, [["22:30", "22:40"]], "23:25");
    expect((await sleepLog(token)).map((event) => event.occurredAt)).toEqual([at("22:40")]);
    // 23:50: work started live from a browser, which records no use.
    vi.setSystemTime(new Date(at("23:50")));
    const work = envelope("activity.started", {
      activityId: newId(),
      category: "work",
      label: "Deploy",
    });
    await pushEvents(token, [work]);
    // Uploads every 15 minutes until 03:00, each with sleep's look due too (more often than its
    // hourly alarm), the phone quiet throughout.
    const minutesOn = (minutes: number) =>
      new Date(Date.parse(at("00:00")) + minutes * 60_000).toISOString();
    const lengths = [];
    for (let quarter = 0; quarter <= 12; quarter += 1) {
      vi.setSystemTime(new Date(minutesOn(quarter * 15)));
      await upload(phone, [], formatInZone(minutesOn(quarter * 15 - 5), MOSCOW, "HH:mm"));
      await sleepDueNow(store);
      await fireAlarm(store);
      lengths.push((await sleepLog(token)).length);
    }
    // The sleep opened before the work goes once, the night opens at the work's start and runs
    // on; then nothing more is written, under any id.
    const written = await sleepLog(token);
    expect(written.map((event) => [event.type, event.occurredAt])).toEqual([
      ["activity.started", at("22:40")],
      ["event.revoked", expect.any(String)],
      ["activity.started", at("23:50")],
    ]);
    expect(written.filter((event) => /-\d+$/u.test(event.id))).toEqual([]);
    expect(new Set(lengths.slice(4))).toEqual(new Set([3]));
    expect(await sleeps(store)).toEqual(
      expect.arrayContaining([{ endAt: null, startAt: at("23:50") }]),
    );
    expect(await sleepDecisions(token)).toHaveLength(3);
  });
});

describe("the store's alarm for automatic sleep", () => {
  it("looks again within the hour at night, at 21:00 by day, and again after each alarm", async () => {
    // No digest windows and a night already over (nothing running long): nothing else the store
    // waits on, so the alarm is sleep's own.
    const { phone, store } = await phoneAccount("1002", { digestWindows: [] });
    expect(await alarmOf(store)).toBeNull();
    await upload(
      phone,
      [
        ["23:10", "23:40"],
        ["07:10", "07:25"],
      ],
      "07:25",
    );
    // 15:00: the next look is at 21:00.
    const evening = Date.parse(wallClockInstant(NEXT_DAY, "21:00", MOSCOW));
    expect(await alarmOf(store)).toBe(evening);
    // An alarm before sleep's time (another wait's) runs no pass and leaves sleep's time armed.
    // That one is the pool's first pass (a store from before its key), so its lease's wake comes
    // first and only reads the waits' times.
    await fireAlarm(store);
    await fireAlarm(store);
    expect(await alarmOf(store)).toBe(evening);
    // At its own time, 23:50, the pass runs and arms the next look an hour on.
    const lateEvening = wallClockInstant(NEXT_DAY, "23:50", MOSCOW);
    vi.setSystemTime(new Date(lateEvening));
    await sleepDueNow(store);
    await fireAlarm(store);
    expect(await alarmOf(store)).toBe(Date.parse(lateEvening) + 60 * 60_000);
    // And again from that alarm: an alarm never leaves the store without its next look.
    vi.setSystemTime(new Date(Date.parse(lateEvening) + 60 * 60_000));
    await fireAlarm(store);
    expect(await alarmOf(store)).toBe(Date.parse(lateEvening) + 120 * 60_000);
  });

  it("decides on a computer's late use at sleep's own alarm, not at its upload or another alarm", async () => {
    const { phone, store, token } = await phoneAccount("1001", { digestWindows: [] });
    await upload(phone, [["23:10", "23:40"]], "05:00");
    expect((await sleepLog(token)).map((event) => event.type)).toEqual(["activity.started"]);
    // The laptop was used 03:00–03:40: the night ended then. Its upload alone decides nothing.
    const computer = await answerOf(endpoints.sessions.createAgent, "/api/sessions/agents", {
      body: { name: "Linux Mint" },
      token,
    });
    const sessions = [{ app: "code", endAt: at("03:40"), startAt: at("03:00") }];
    const body = { deviceId: "laptop", deviceName: "Linux Mint", sessions };
    expect((await call("/api/usage/sessions", { body, token: computer.token })).status).toBe(200);
    expect(await sleepLog(token)).toHaveLength(1);
    // The assistant's retry two minutes on fires first: still no pass.
    const now = new Date().toISOString();
    const retryAt = new Date(Date.parse(now) + 2 * 60_000).toISOString();
    await store.enqueueParse({ channel: "api", retryAt, text: "купить хлеб" }, now);
    await fireAlarm(store);
    expect(await sleepLog(token)).toHaveLength(1);
    // Sleep's own alarm decides on it.
    await sleepDueNow(store);
    await fireAlarm(store);
    expect((await sleepLog(token)).map((event) => [event.type, event.occurredAt])).toEqual([
      ["activity.started", at("23:40")],
      ["activity.stopped", at("03:00")],
    ]);
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
    // Nothing is coming, so the pool looks again in a day (never "never": bug-lessons class 57).
    expect(run.nextAt).toBe(new Date(Date.parse(now) + 24 * 3_600_000).toISOString());
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
