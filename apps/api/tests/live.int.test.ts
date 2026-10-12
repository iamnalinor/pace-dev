import { describe, expect, it } from "vitest";

import { newId } from "@pace/core";

import { api, json, loginAsDev } from "./helpers.ts";

/** A complete task.created event written on the phone. */
const event = () => ({
  deviceId: "phone-1",
  id: newId(),
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "preset-work", subtasks: [], taskId: newId(), title: "t" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
});

/** Opens the live channel the way a browser does: the token rides in the subprotocols. */
const open = async (
  token: string,
  device = "phone-1",
): Promise<{ readonly response: Response; readonly socket: null | WebSocket }> => {
  const response = await api.fetch(
    new Request(`https://pace-api.test/api/sync/live?device=${device}`, {
      headers: { "Sec-WebSocket-Protocol": `pace.v1, pace.auth.${token}`, Upgrade: "websocket" },
    }),
  );
  const socket = response.webSocket;
  socket?.accept();
  return { response, socket };
};

/** The next message, or `null` when none comes within half a second. */
const nextMessage = async (socket: WebSocket): Promise<null | string> =>
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, 500);
    socket.addEventListener(
      "message",
      (message) => {
        clearTimeout(timer);
        resolve(String(message.data));
      },
      { once: true },
    );
  });

describe("live sync channel", () => {
  it("tells another device as soon as the log grows, with the new sequence", async () => {
    const token = await loginAsDev("1001");
    const { response, socket } = await open(token, "laptop-1");
    expect(response.status).toBe(101);
    expect(response.headers.get("Sec-WebSocket-Protocol")).toBe("pace.v1");
    if (socket === null) {
      throw new Error("no socket");
    }
    const waiting = nextMessage(socket);
    await json("/api/sync/push", { body: { events: [event()] }, token });
    expect(JSON.parse((await waiting) ?? "null")).toEqual({ seq: 1, type: "changed" });
    socket.close();
  });

  it("does not echo a device's own push back to it", async () => {
    const token = await loginAsDev("1001");
    const { socket } = await open(token, "phone-1");
    if (socket === null) {
      throw new Error("no socket");
    }
    const waiting = nextMessage(socket);
    await json("/api/sync/push", { body: { events: [event()] }, token });
    expect(await waiting).toBeNull();
    socket.close();
  });

  it("answers a ping without waking the store's logic", async () => {
    const token = await loginAsDev("1001");
    const { socket } = await open(token);
    if (socket === null) {
      throw new Error("no socket");
    }
    const waiting = nextMessage(socket);
    socket.send("ping");
    expect(await waiting).toBe("pong");
    socket.close();
  });

  it("refuses a missing or wrong token, and a plain request", async () => {
    expect((await open("nope")).response.status).toBe(401);
    const plain = await api.fetch(new Request("https://pace-api.test/api/sync/live"));
    expect(plain.status).toBe(426);
  });
});
