# Task 10 — Part D: Wipe data and Delete account, confirmed on the site and then in Telegram

Owner's words: «И подраздел danger: Wipe data (как factory reset, делает акк чистым как будто после реги), Delete account.
Оба подтверждаем сначала на сайте, а потом в тг боте – этакое 2fa.»

Existing: `DELETE /api/me` (apps/api/src/account/account-routes.ts: revokes OAuth grants, `UserStore.wipe()`, deletes the
D1 user), apps/app/src/features/settings/delete-account.tsx (inline confirm card → auth.deleteAccount()). Task 7 added a
`storeId` that changes on wipe and makes clients drop their local copy.

## Flow
1. Settings → Danger zone: "Wipe data" and "Delete account" (ghost/warn buttons sized to content). Each opens an inline
   confirm (as delete-account does today) explaining what happens:
   - Wipe: "Every task, project, preset, tracked activity and notification goes. Your account, sign-ins and Telegram link
     stay." → button "Wipe — confirm in Telegram".
   - Delete: as today's text → "Delete — confirm in Telegram".
2. The client calls `POST /api/account/confirmations { action: "wipe" | "delete" }` → `{ id, expiresAt }`. The server
   stores a pending confirmation (D1 table `account_confirmations`: id, userId, action, createdAt, expiresAt (5 min),
   status `pending|confirmed|cancelled|expired`, sessionId of the requester) and sends a Telegram message to the user's
   chat: "Confirm wiping all data in Pace?" / "Confirm deleting your Pace account?" with [Confirm] [Cancel] (callback data
   carries the confirmation id). No chat known → 409 `account/no-telegram` (the UI shows "Open the bot once, then try
   again" — a person who logged in has a chat in practice).
3. The site shows "Waiting for confirmation in Telegram…" with a Cancel link and polls
   `GET /api/account/confirmations/:id` every 2 s (stop on leave).
4. Bot callback Confirm (only from the same Telegram user): runs the action, marks confirmed, edits the message ("All data
   wiped." / "Account deleted."). Cancel: marks cancelled, edits the message. Expired: the callback answers "Expired".
   - wipe: the user DO `wipe()` (fresh storeId, default settings, alarms cleared), notifications cleared; D1 user and
     sessions stay; MCP grants stay. Clients see the new storeId on their next pull and reset (Task 7).
   - delete: today's DELETE /api/me logic, extracted into a shared function used by the callback; the old
     `DELETE /api/me` endpoint is removed (only the confirmed flow can delete).
5. The site sees confirmed → wipe: trigger a sync pull (the store resets) and show a toast "All data wiped"; delete: sign
   out and go to /login. Cancelled/expired → back to the buttons with a short note.

Contract first (packages/core/src/api/endpoints.ts + schemas), errors as string-literal codes mapped exhaustively.
Rate limit: at most one pending confirmation per user per action (a new request replaces the old one and the old Telegram
message is edited to "Replaced by a newer request").

## Tests
API int: create → Telegram message sent (stubbed fetch) with both buttons; confirm via a simulated callback_query update to
the webhook (see existing bot tests for how they post updates) wipes the store (storeId changes, events gone, user and
session still valid) / deletes the account (session no longer valid); cancel; expiry; another Telegram user cannot
confirm; 409 without a chat. App: the confirm → waiting → done states (fake API). e2e: if e2e can simulate the bot callback
(the worker runs with ENVIRONMENT test; check whether e2e has a helper to post webhook updates — if not, add a minimal
helper that posts a callback_query to /telegram/webhook with the secret the test env uses), add a spec for wipe.
`bun lint`, `bun test:unit`, `bun test:api`, `bun test:app` green.
