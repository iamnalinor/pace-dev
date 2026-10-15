import { DurableObject } from "cloudflare:workers";

import type { Event } from "@pace/core";

import { LIVE_PROTOCOL } from "../shared/socket-auth.ts";

/** A device id is a tag on its socket; tags are short. */
const MAX_TAG = 128;

/**
Accepts a live client as a hibernating WebSocket (no duration billed while it is quiet),
tagged with the device it serves so that device is not told about its own writes.
*/
export const acceptLiveSocket = (ctx: DurableObjectState, request: Request): Response => {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  const device = new URL(request.url).searchParams.get("device")?.slice(0, MAX_TAG) ?? "";
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server, device === "" ? [] : [device]);
  return new Response(null, {
    headers: { "Sec-WebSocket-Protocol": LIVE_PROTOCOL },
    // eslint-disable-next-line unicorn/no-invalid-response-options -- 101 Switching Protocols is how a Worker hands over a WebSocket
    status: 101,
    webSocket: client,
  });
};

/** Tells every live device but the one that wrote them that the log grew to `seq`. */
export const announceChange = (
  ctx: DurableObjectState,
  inserted: readonly Event[],
  seq: number,
): void => {
  const message = JSON.stringify({ seq, type: "changed" });
  for (const socket of ctx.getWebSockets()) {
    const [device] = ctx.getTags(socket);
    if (device !== undefined && inserted.every((event) => event.deviceId === device)) {
      continue;
    }
    try {
      socket.send(message);
    } catch {
      // A socket closing meanwhile: its client reconnects and pulls anyway.
    }
  }
};

/** Sends a message to every live client (a feed update: a notification new or resolved). */
export const broadcast = (ctx: DurableObjectState, message: object): void => {
  const text = JSON.stringify(message);
  for (const socket of ctx.getWebSockets()) {
    try {
      socket.send(text);
    } catch {
      // A socket closing meanwhile: its client reloads the feed when it reconnects.
    }
  }
};

/**
Whether a socket may close with this code (RFC 6455 §7.4): 1000–1003 and 1007–1014 of the
protocol's, and 3000–4999 for libraries and apps. The rest are only ever received (1005 none
given, 1006 dropped, 1015 TLS failed) or reserved: sending one throws.
*/
const isSendable = (code: number): boolean =>
  (code >= 1000 && code <= 1003) ||
  (code >= 1007 && code <= 1014) ||
  (code >= 3000 && code <= 4999);

/** The code to close with in answer to a device's close: its own, unless that may not be sent. */
export const replyCloseCode = (received: number): number =>
  isSendable(received) ? received : 1000;

/**
The live channel's half of a user's store: it accepts live clients (the Worker has checked the
bearer), answers their keep-alive without waking (no duration billed) and closes cleanly.
*/
export class LiveStore extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override fetch(request: Request): Response {
    return acceptLiveSocket(this.ctx, request);
  }

  override webSocketClose(socket: WebSocket, code: number): void {
    socket.close(replyCloseCode(code), "closing");
  }
}
