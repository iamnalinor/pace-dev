import type { ActorContext } from "../../shared/ports/live-channel.ts";

import { actorStorage } from "./actor-storage.ts";

/** Cloudflare's hibernating socket registry and actor lifecycle. */
export const actorContext = (ctx: DurableObjectState): ActorContext => ({
  blockConcurrencyWhile: ctx.blockConcurrencyWhile.bind(ctx),
  getTags: (socket) => ctx.getTags(socket as WebSocket),
  getWebSockets: (tag) => ctx.getWebSockets(tag),
  id: ctx.id,
  keepAlive: (request, response) => {
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(request, response));
  },
  storage: actorStorage(ctx.storage),
  upgrade: (protocol, tags, hello) => {
    const { 0: client, 1: server } = new WebSocketPair();
    ctx.acceptWebSocket(server, [...tags]);
    if (hello !== undefined) {
      try {
        server.send(hello);
      } catch {
        /* A closing socket reconnects and pulls. */
      }
    }
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": protocol },
      // eslint-disable-next-line unicorn/no-invalid-response-options -- Workers upgrade a WebSocket with 101.
      status: 101,
      webSocket: client,
    });
  },
  waitUntil: ctx.waitUntil.bind(ctx),
});
