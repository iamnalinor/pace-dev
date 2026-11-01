import { DurableObject } from "cloudflare:workers";

import { type Event, type KnownLiveServerMessage, LIVE_PAGE, LIVE_V1, LIVE_V2 } from "@pace/core";

import { LIVE_EXPIRES_HEADER, LIVE_SESSION_HEADER, liveProtocolOf } from "../shared/socket-auth.ts";
import { answerLiveMessage, type LiveStoreCalls } from "./live-messages.ts";
import {
  endLiveSessions,
  isServed,
  namedSession,
  servedSockets,
  sessionTags,
} from "./live-sessions.ts";
import { storeIdOf } from "./store-identity.ts";

/** A device id is a tag on its socket; tags are short. */
const MAX_TAG = 128;

/** The tag that names the device a socket serves (the other tag is its subprotocol). */
const DEVICE_TAG = "device:";

/** Sends one message to one socket; one closing meanwhile reconnects and catches up anyway. */
const sendTo = (socket: WebSocket, message: KnownLiveServerMessage): void => {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // A socket closing meanwhile: its client reconnects and pulls anyway.
  }
};

/**
Accepts a live client as a hibernating WebSocket (no duration billed while it is quiet), tagged
with the subprotocol it speaks, the session that opened it (see `live-sessions.ts`) and the device
it serves, so that device is not told about its own writes. Tags are all a socket keeps: they
survive hibernation, memory does not. A v2 socket hears `hello` first. A request the Worker named
no session for is refused: no socket outlives a session it cannot be tied to.
*/
export const acceptLiveSocket = (ctx: DurableObjectState, request: Request): Response => {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  const session = namedSession(
    request.headers.get(LIVE_SESSION_HEADER),
    request.headers.get(LIVE_EXPIRES_HEADER),
  );
  if (session === null) {
    return new Response("No session", { status: 401 });
  }
  const protocol = liveProtocolOf(request.headers.get("Sec-WebSocket-Protocol"));
  const device = new URL(request.url).searchParams.get("device")?.slice(0, MAX_TAG) ?? "";
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server, [
    protocol,
    ...sessionTags(session.sessionId, session.expiresAt),
    ...(device === "" ? [] : [`${DEVICE_TAG}${device}`]),
  ]);
  if (protocol === LIVE_V2) {
    sendTo(server, { protocol: LIVE_V2, type: "hello" });
  }
  return new Response(null, {
    headers: { "Sec-WebSocket-Protocol": protocol },
    // eslint-disable-next-line unicorn/no-invalid-response-options -- 101 Switching Protocols is how a Worker hands over a WebSocket
    status: 101,
    webSocket: client,
  });
};

/** An append, as the live sockets hear about it. */
export type LogChange = {
  readonly inserted: readonly Event[];
  /** The log's sequence before the append. */
  readonly since: number;
  /** The log's sequence after it. */
  readonly seq: number;
};

/**
Tells every live device but the one that wrote them that the log grew: a v1 socket hears
`changed` (and pulls over HTTP), a v2 socket gets the events themselves, or `more` with none when
the append is too big for one message (it pulls them over the socket). The events carry the
store's id, read here so that they and the id can never come from two stores.
*/
export const announceChange = async (ctx: DurableObjectState, change: LogChange): Promise<void> => {
  const { inserted, seq, since } = change;
  const isTooBig = inserted.length > LIVE_PAGE;
  const events: KnownLiveServerMessage = {
    events: isTooBig ? [] : [...inserted],
    more: isTooBig,
    seq,
    since,
    storeId: await storeIdOf(ctx.storage),
    type: "events",
  };
  const announce = (protocol: string, message: KnownLiveServerMessage): void => {
    for (const socket of servedSockets(ctx, protocol)) {
      const device = ctx
        .getTags(socket)
        .find((tag) => tag.startsWith(DEVICE_TAG))
        ?.slice(DEVICE_TAG.length);
      if (device !== undefined && inserted.every((event) => event.deviceId === device)) {
        continue;
      }
      sendTo(socket, message);
    }
  };
  announce(LIVE_V1, { seq, type: "changed" });
  announce(LIVE_V2, events);
};

/** Sends a message to every live client (a feed update: a notification new or resolved). */
export const broadcast = (ctx: DurableObjectState, message: object): void => {
  const text = JSON.stringify(message);
  for (const socket of servedSockets(ctx)) {
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
bearer), answers their keep-alive without waking (no duration billed), takes a v2 socket's pushes
and pulls through the store's own `push` and `list` (the HTTP routes' calls) and closes cleanly.
*/
export abstract class LiveStore extends DurableObject implements LiveStoreCalls {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  abstract push(...args: Parameters<LiveStoreCalls["push"]>): ReturnType<LiveStoreCalls["push"]>;

  abstract list(...args: Parameters<LiveStoreCalls["list"]>): ReturnType<LiveStoreCalls["list"]>;

  override fetch(request: Request): Response {
    return acceptLiveSocket(this.ctx, request);
  }

  /** Closes the live sockets of a session that ended, or of all when none is named. */
  endLiveSessions(sessionId?: string): void {
    endLiveSessions(this.ctx, sessionId);
  }

  /**
  A request on a live socket, answered on it. A v1 socket asks nothing, so its messages go
  unanswered as they always did (its `ping` never gets here: the runtime answers it unwoken). One
  whose session expired is closed instead of answered.
  */
  override async webSocketMessage(socket: WebSocket, data: ArrayBuffer | string): Promise<void> {
    if (!isServed(this.ctx, socket) || !this.ctx.getTags(socket).includes(LIVE_V2)) {
      return;
    }
    sendTo(socket, await answerLiveMessage(this, data, new Date().toISOString()));
  }

  override webSocketClose(socket: WebSocket, code: number): void {
    try {
      socket.close(replyCloseCode(code), "closing");
    } catch {
      // The store closed it first (its session ended): the device's close only confirms it.
    }
  }
}
