# Hot 30 days, cold archive in R2 (to do; owner asked for it 2026-11-01)

A brief for a new session. Read `CLAUDE.md`, `docs/architecture.md` and `docs/self-hosting.md`
first. Follow the usual working method (brainstorm → plan → tasks → review → QA).

## Why

The owner's words: don't lose data, but don't let the database swell and eat the Cloudflare free
limits; only the last ~30 days are needed day to day, everything older is for analytics and may be
slower.

Today every person's Durable Object keeps the whole event log, plus `usage_sessions` and
`phone_uses`, forever. A cold start materializes the whole log, so rows read per start grow with
the age of the account, not with activity. The free plan limits rows read and written per day and
storage; growth in history alone will eventually cross them.

PR #48's last fix round already removed the per-alarm waste (a cold instance re-reading the log and
rewriting projections every 15 minutes at night). This task bounds what is left.

## Step 0: measure first

Before building anything, read real numbers: rows read / rows written / storage per day for the DO
namespace and D1 (Cloudflare dashboard or the GraphQL Analytics API, read-only token in GitHub
secrets, never pasted into chat). Write down the curve and the date it would cross the free limits.
If that date is years away, do only steps 1 and 4 now.

## Design to start from

1. **Checkpoint + tail (the main saving).** The DO stores a checkpoint, the materialized state as of
   a cutoff (a whole day ~30–45 days back, in the person's zone), and only the events after the
   cutoff. A cold start reads checkpoint + tail: bounded by 30 days, not by history. The cutoff moves
   forward once a day (on the alarm), never past an event that something open still depends on
   (a running task, an open series instance, an unanswered pool item, an undecided night).
2. **Cold archive in R2.** Events older than the cutoff go to R2 as one compressed JSONL object per
   person per month (immutable; a later correction writes a new version of that month). Delete from
   the DO only after the object is written, read back and its checksum and count match. R2's free
   tier (storage and operations) is far above one person's needs; self-hosting docs get the bucket.
3. **Corrections to archived events.** `occurredAt` is editable and `event.amended` /
   `event.revoked` may target an old event. Rule: the correction itself is a new event (hot), and the
   materializer applies it on top of the checkpoint; only when it changes state before the cutoff
   (rare) the server rebuilds the checkpoint from the archive (slow path, tested).
4. **Raw usage data.** `usage_sessions` / `phone_uses` are needed raw only for the sleep window
   (36–60 h) and recent stats. Keep 30 days raw; roll older days into daily per-app totals (a few rows
   per day) in the DO; raw rows go to the same monthly R2 archive.
5. **Analytics over old periods.** Week/month stats and MCP queries before the cutoff read monthly
   aggregates kept in the DO (small), and the R2 archive when raw events are asked for (slower, says
   so in the UI and in the MCP tool's answer).
6. **Sync (trace the client side, bug-lessons class 1).** A client's pull from a cursor older than
   the cutoff, and a new device, get the checkpoint + tail instead of the whole log; older history on
   demand. The client store must accept a checkpoint (contract change in `endpoints.ts`, protocol
   bump, an older client gets the versions screen). Pin the steady state: after the first pull the
   network goes quiet.
7. **Export.** The existing export must still return everything (hot + archive).

## Tests that must exist

- Property: materializing checkpoint + tail equals materializing the whole log, for any cutoff the
  rules allow, including corrections that target archived events.
- workerd: archive → read back → delete, with a write that fails halfway (nothing is deleted).
- A cold instance per alarm over a simulated year: rows read per start stay flat.
- e2e: a new device signs in to an account with archived months and shows the same Week as before.
