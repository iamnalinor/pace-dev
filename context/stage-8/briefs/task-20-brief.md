# Task 20 — sync and notifications over the WebSocket (HTTP stays as the fallback)

Owner agreed: move to the socket only what makes sense — the sync hot path and notifications; everything else stays HTTP.
Today: `GET /api/sync/live` hibernating WebSocket per user DO says `{"type":"changed","seq"}`; the client then pulls/pushes over
HTTP (packages/client sync-client.ts, apps/api sync routes, user-store live socket code).
- Protocol on the existing socket (versioned, `pace.v2` subprotocol; keep `pace.v1` behaviour for old clients until protocol bump):
  client→server `{type:"push", id, storeId, events}` → `{type:"pushed", id, accepted, rejected, seq}` or `{type:"error", id, code}`
  (incl. `store/changed`); server→client `{type:"events", seq, storeId, events, more}` sent proactively after any append (except to
  the writer, which gets `pushed`), and `{type:"pull", since}` → paged `events` for catch-up on (re)connect; notifications
  `{type:"notification"|"dismiss", …}` (from Task 8). Request ids for correlation, timeouts, and a bounded in-flight window.
- Client: when the socket is open, use it for push and for receiving events; when closed or a request times out, fall back to the HTTP
  endpoints (unchanged); the outbox and storeId rules from Task 7 apply identically on both paths (one shared code path for "apply
  a page of events" and "send the outbox" with two transports — bug class 1).
- Server: socket messages handled in the DO (hibernation-friendly: no per-socket in-memory state beyond attachments); validation via
  the same core schemas as the HTTP routes (shared function, not a copy).
- Web and Android both. Tests: client sync with a fake socket (open → socket path; drop mid-push → HTTP fallback without duplicate
  pushes thanks to event ids; store/changed over socket), API tests through the DO websocket (vitest-pool-workers supports
  WebSocket upgrade), e2e: two browser contexts see each other's change within ~1 s with HTTP polling disabled.
