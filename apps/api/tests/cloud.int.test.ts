import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints } from "@pace/core";

import { answerOf, call, json, loginAsDev } from "./helpers.ts";

const RANGE = "from=2026-10-05T00:00:00.000Z&to=2026-10-12T00:00:00.000Z";

const event = (id: string, day: number, title: string) => ({
  endAt: `2026-10-0${String(day)}T11:30:00.000Z`,
  id,
  series: null,
  startAt: `2026-10-0${String(day)}T10:00:00.000Z`,
  title,
});

const sync = async (token: string, deviceId: string, events: readonly unknown[]) =>
  await json("/api/calendar/sync", {
    body: { deviceId, events, from: "2026-10-05T00:00:00.000Z", to: "2026-10-12T00:00:00.000Z" },
    token,
  });

const titles = async (token: string): Promise<readonly string[]> =>
  (await answerOf(endpoints.calendar.list, `/api/calendar?${RANGE}`, { token })).events.map(
    (item) => item.title,
  );

describe("the calendar copy", () => {
  it("replaces a phone's range, keeps another phone's events, and forgets one phone's copy", async () => {
    const token = await loginAsDev("1001");
    await sync(token, "phone-a", [event("e1", 6, "Алгебра"), event("e2", 7, "Матанализ")]);
    await sync(token, "phone-b", [event("e9", 8, "Английский")]);
    await sync(token, "phone-a", [event("e1", 6, "Алгебра")]);
    // The second phone knows the same lecture under its own id: listed once.
    await sync(token, "phone-b", [event("e9", 8, "Английский"), event("b-77", 6, "Алгебра")]);
    expect(await titles(token)).toEqual(["Алгебра", "Английский"]);
    const clear = await call("/api/calendar?deviceId=phone-a", { method: "DELETE", token });
    expect(clear.status).toBe(200);
    expect(await titles(token)).toEqual(["Алгебра", "Английский"]);
    await call("/api/calendar?deviceId=phone-b", { method: "DELETE", token });
    expect(await titles(token)).toEqual([]);
    expect((await call(`/api/calendar?${RANGE}`)).status).toBe(401);
  });

  it("keeps what the phone tells about an event: place, notes, link, calendar and people", async () => {
    const token = await loginAsDev("1002");
    const details = {
      attendeeCount: 12,
      calendarName: "University",
      location: "Room 214, Main building",
      notes: "Bring the problem set.\nhttps://example.org/sheet",
      organizer: "Prof. Ivanova",
      url: "https://meet.google.com/abc-defg-hij",
    };
    await sync(token, "phone-a", [
      { ...event("e1", 6, "Алгебра"), ...details },
      event("e2", 7, "Матанализ"),
    ]);
    const { events } = await answerOf(endpoints.calendar.list, `/api/calendar?${RANGE}`, { token });
    // An event the phone said nothing more about comes back as it went (an older phone).
    expect(events).toEqual([
      { ...event("e1", 6, "Алгебра"), ...details },
      event("e2", 7, "Матанализ"),
    ]);
    const tooLong = await call("/api/calendar/sync", {
      body: {
        deviceId: "phone-a",
        events: [{ ...event("e3", 8, "Английский"), notes: "x".repeat(2001) }],
        from: "2026-10-05T00:00:00.000Z",
        to: "2026-10-12T00:00:00.000Z",
      },
      token,
    });
    expect(tooLong.status).toBe(422);
  });
});

/** The laptop's one VS Code session, seen until `endAt`. */
const upload = (endAt: string) => ({
  deviceId: "laptop-1",
  deviceName: "Laptop",
  sessions: [{ app: "code", endAt, startAt: "2026-10-06T10:00:00.000Z" }],
});

describe("usage and device tokens", () => {
  it("keeps one session per device, app and start, the later end winning", async () => {
    const token = await loginAsDev("1001");
    await json("/api/usage/sessions", { body: upload("2026-10-06T10:20:00.000Z"), token });
    await json("/api/usage/sessions", { body: upload("2026-10-06T10:45:00.000Z"), token });
    await json("/api/usage/sessions", { body: upload("2026-10-06T10:30:00.000Z"), token });
    const { sessions } = await answerOf(endpoints.usage.list, `/api/usage?${RANGE}`, { token });
    expect(sessions).toEqual([
      {
        app: "code",
        deviceId: "laptop-1",
        deviceName: "Laptop",
        endAt: "2026-10-06T10:45:00.000Z",
        startAt: "2026-10-06T10:00:00.000Z",
      },
    ]);
  });

  it("gives a computer a token that can only upload its usage", async () => {
    const token = await loginAsDev("1002");
    const device = await answerOf(endpoints.sessions.createAgent, "/api/sessions/agents", {
      body: { name: "Linux Mint" },
      token,
    });
    // Whatever the request claims, a computer's sessions are filed under that computer.
    const body = {
      deviceId: "someone-elses-phone",
      deviceName: "Linux Mint",
      sessions: [
        { app: "firefox", endAt: "2026-10-06T09:30:00.000Z", startAt: "2026-10-06T09:00:00.000Z" },
      ],
    };
    const sent = await call("/api/usage/sessions", { body, token: device.token });
    expect(sent.status).toBe(200);
    expect((await call(`/api/usage?${RANGE}`, { token: device.token })).status).toBe(403);
    expect((await call("/api/sync/pull", { token: device.token })).status).toBe(403);
    expect((await call("/api/sessions", { token: device.token })).status).toBe(403);
    const { sessions } = await answerOf(endpoints.usage.list, `/api/usage?${RANGE}`, { token });
    expect(sessions).toContainEqual(
      expect.objectContaining({ app: "firefox", deviceId: device.id, deviceName: "Linux Mint" }),
    );
  });
});

/** The person's store, as the sleep rules on the server read it. */
const storeOf = async (token: string) => {
  const me = await json<{ id: string }>("/api/me", { token });
  return env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
};

/** A signed-in phone of an account with nothing in it yet (tests in a file share the store). */
const freshPhone = async (telegramId: string): Promise<string> => {
  const earlier = await loginAsDev(telegramId);
  await call("/api/test/account", { method: "DELETE", token: earlier });
  return await loginAsDev(telegramId);
};

const NIGHT = "2026-10-06T18:00:00.000Z";

/**
The phone at night: an alarm shown over the lock screen (an app session, not use) and the one
time it was unlocked, read until 01:00.
*/
const phoneNight = {
  deviceId: "phone-1",
  deviceName: "Pixel 8",
  sessions: [
    { app: "Clock", endAt: "2026-10-06T22:05:00.000Z", startAt: "2026-10-06T22:00:00.000Z" },
  ],
  until: "2026-10-07T01:00:00.000Z",
  uses: [{ endAt: "2026-10-06T21:40:00.000Z", startAt: "2026-10-06T21:30:00.000Z" }],
};

describe("what the sleep rules know about use", () => {
  it("keeps a phone's uses and how far it read, never its app sessions as use", async () => {
    const token = await freshPhone("1001");
    const answer = await answerOf(endpoints.usage.upload, "/api/usage/sessions", {
      body: phoneNight,
      token,
    });
    expect(answer.stored).toBeGreaterThan(0);
    const usage = await (await storeOf(token)).usageForSleep(NIGHT);
    expect(usage).toEqual({
      knownUntil: "2026-10-07T01:00:00.000Z",
      uses: [
        {
          deviceId: "phone-1",
          endAt: "2026-10-06T21:40:00.000Z",
          startAt: "2026-10-06T21:30:00.000Z",
        },
      ],
    });
    // The app sessions are still listed as they were.
    const { sessions } = await answerOf(endpoints.usage.list, `/api/usage?${RANGE}`, { token });
    expect(sessions).toEqual([expect.objectContaining({ app: "Clock", deviceId: "phone-1" })]);
  });

  it("grows a use sent again with a later end, one row", async () => {
    const token = await freshPhone("1002");
    const use = { endAt: "2026-10-06T23:10:00.000Z", startAt: "2026-10-06T23:00:00.000Z" };
    const body = { deviceId: "phone-1", deviceName: "Pixel 8", sessions: [], uses: [use] };
    await json("/api/usage/sessions", {
      body: { ...body, until: "2026-10-06T23:10:00.000Z" },
      token,
    });
    await json("/api/usage/sessions", {
      body: {
        ...body,
        until: "2026-10-06T23:30:00.000Z",
        uses: [{ ...use, endAt: "2026-10-06T23:25:00.000Z" }],
      },
      token,
    });
    // An older copy arriving late never shrinks it.
    await json("/api/usage/sessions", {
      body: { ...body, until: "2026-10-06T23:30:00.000Z" },
      token,
    });
    const usage = await (await storeOf(token)).usageForSleep(NIGHT);
    expect(usage).toEqual({
      knownUntil: "2026-10-06T23:30:00.000Z",
      uses: [
        {
          deviceId: "phone-1",
          endAt: "2026-10-06T23:25:00.000Z",
          startAt: "2026-10-06T23:00:00.000Z",
        },
      ],
    });
  });

  it("counts a computer's sessions as use without letting it say how far anything is known", async () => {
    const token = await freshPhone("1001");
    const computer = await answerOf(endpoints.sessions.createAgent, "/api/sessions/agents", {
      body: { name: "Linux Mint" },
      token,
    });
    const body = {
      deviceId: "laptop",
      deviceName: "Linux Mint",
      sessions: [
        { app: "code", endAt: "2026-10-06T22:30:00.000Z", startAt: "2026-10-06T21:00:00.000Z" },
      ],
    };
    const sent = await answerOf(endpoints.usage.upload, "/api/usage/sessions", {
      body,
      token: computer.token,
    });
    expect(sent.stored).toBe(1);
    const store = await storeOf(token);
    expect(await store.usageForSleep(NIGHT)).toEqual({
      knownUntil: null,
      uses: [
        {
          deviceId: computer.id,
          endAt: "2026-10-06T22:30:00.000Z",
          startAt: "2026-10-06T21:00:00.000Z",
        },
      ],
    });
    // With the phone's upload beside it: both devices' use, bounded by the phone.
    await json("/api/usage/sessions", { body: phoneNight, token });
    const both = await store.usageForSleep(NIGHT);
    expect(both.knownUntil).toBe("2026-10-07T01:00:00.000Z");
    expect(both.uses.map((use) => use.deviceId)).toEqual([computer.id, "phone-1"]);
    // What ended before `from` is left out.
    expect((await store.usageForSleep("2026-10-06T21:45:00.000Z")).uses).toEqual([
      expect.objectContaining({ deviceId: computer.id }),
    ]);
  });

  it("decides nothing from a phone that has not uploaded for a day", async () => {
    const token = await freshPhone("1002");
    const store = await storeOf(token);
    const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await store.addUsage({ ...phoneNight, isPhone: true }, dayAgo);
    expect((await store.usageForSleep(NIGHT)).knownUntil).toBeNull();
    await store.addUsage(
      { ...phoneNight, isPhone: true, until: "2026-10-07T00:30:00.000Z" },
      new Date().toISOString(),
    );
    expect((await store.usageForSleep(NIGHT)).knownUntil).toBe("2026-10-07T00:30:00.000Z");
  });

  it("never takes a phone's word for a quiet later than its upload arrived", async () => {
    const token = await freshPhone("1001");
    const before = new Date().toISOString();
    await json("/api/usage/sessions", {
      body: { ...phoneNight, until: "2099-01-01T00:00:00.000Z" },
      token,
    });
    const { knownUntil } = await (await storeOf(token)).usageForSleep(NIGHT);
    const after = new Date().toISOString();
    expect(knownUntil !== null && knownUntil >= before && knownUntil <= after).toBe(true);
  });

  it("bounds what is known by the phone that read least far", async () => {
    const token = await freshPhone("1001");
    await json("/api/usage/sessions", { body: phoneNight, token });
    await json("/api/usage/sessions", {
      body: { ...phoneNight, deviceId: "phone-2", until: "2026-10-06T23:15:00.000Z", uses: [] },
      token,
    });
    expect((await (await storeOf(token)).usageForSleep(NIGHT)).knownUntil).toBe(
      "2026-10-06T23:15:00.000Z",
    );
  });

  it("treats an older app's upload (no uses, no until) as use it cannot bound", async () => {
    const token = await freshPhone("1002");
    const { until: _until, uses: _uses, ...older } = phoneNight;
    await json("/api/usage/sessions", { body: older, token });
    expect(await (await storeOf(token)).usageForSleep(NIGHT)).toEqual({
      knownUntil: null,
      uses: [
        {
          deviceId: "phone-1",
          endAt: "2026-10-06T22:05:00.000Z",
          startAt: "2026-10-06T22:00:00.000Z",
        },
      ],
    });
  });

  it("refuses an upload that sends more uses than it may, or a key it does not know", async () => {
    const token = await freshPhone("1001");
    const use = { endAt: "2026-10-06T21:40:00.000Z", startAt: "2026-10-06T21:30:00.000Z" };
    const many = await call("/api/usage/sessions", {
      body: { ...phoneNight, uses: Array.from({ length: 1001 }, () => use) },
      token,
    });
    expect(many.status).toBe(422);
    const extra = await call("/api/usage/sessions", {
      body: { ...phoneNight, uses: [{ ...use, app: "Clock" }] },
      token,
    });
    expect(extra.status).toBe(422);
  });
});
