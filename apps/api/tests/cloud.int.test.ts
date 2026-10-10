import { describe, expect, it } from "vitest";

import { call, json, loginAsDev } from "./helpers.ts";

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
  (await json<{ events: { title: string }[] }>(`/api/calendar?${RANGE}`, { token })).events.map(
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
    const { sessions } = await json<{ sessions: unknown[] }>(`/api/usage?${RANGE}`, { token });
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

  it("gives a computer a token that can only upload its usage, until it is revoked", async () => {
    const token = await loginAsDev("1002");
    const device = await json<{ id: string; token: string; name: string }>("/api/devices", {
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
    expect((await call("/api/devices", { token: device.token })).status).toBe(403);

    // The phone signed in to the app sends under its own id: listed too, newest activity first.
    await json("/api/usage/sessions", {
      body: { ...upload("2026-10-06T10:45:00.000Z"), deviceName: "Pixel" },
      token,
    });
    const { devices } = await json<{ devices: unknown[] }>("/api/devices", { token });
    expect(devices).toEqual([
      expect.objectContaining({
        kind: "phone",
        lastActivityAt: "2026-10-06T10:45:00.000Z",
        name: "Pixel",
      }),
      expect.objectContaining({
        id: device.id,
        kind: "computer",
        lastActivityAt: "2026-10-06T09:30:00.000Z",
        name: "Linux Mint",
      }),
    ]);
    expect((await call(`/api/devices/${device.id}`, { method: "DELETE", token })).status).toBe(200);
    expect((await call("/api/usage/sessions", { body, token: device.token })).status).toBe(401);
    expect((await call(`/api/devices/${device.id}`, { method: "DELETE", token })).status).toBe(404);
  });
});
