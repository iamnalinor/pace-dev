# Task 2: Firebase metadata HTTP smoke

Target: the uncommitted Task 2 Worker in `pace-dev`, run locally through Wrangler 4.156.0 and workerd on 2026-11-03. This is feature API E2E: real local D1, actual Worker HTTP, synthetic configuration, and local dev sessions. It excludes Android/emulator behavior, live FCM delivery, and full release QA.

## Reproduction

From `pace-dev`, run `python ../tooling/feature-e2e.py`. The harness sets `PATH` to include Bun, turns Wrangler metrics and host process binding import off, and uses explicit temporary dotenv files, a temporary local D1 persistence directory, and IPv4 loopback only.

```bash
apps/api/node_modules/.bin/wrangler d1 migrations apply DB --local --env dev \
  --config apps/api/wrangler.jsonc --env-file "$state/matched.env" --persist-to "$state"
apps/api/node_modules/.bin/wrangler dev --local --env dev \
  --config apps/api/wrangler.jsonc --env-file "$state/$case.env" --persist-to "$state" \
  --ip 127.0.0.1 --port 8797 --inspector-port 0
```

For each configuration, the harness starts a fresh Worker, awaits HTTP health, requests `GET /api/instance` twice without auth, checks `GET /api/health`, and calls `POST /api/auth/dev` with `{"telegramId":"844001"}`. It uses the returned bearer token for `GET /api/me` and asserts the same user. Credentials and session tokens are not printed. The two instance requests exercise warning deduplication. The harness stops each Worker process group and removes temporary state on exit.

## Observations

**PASS** (harness exit 0). All nine local D1 migrations applied successfully (`0000_init.sql` through `0008_worried_blue_marvel.sql`).

| Firebase bindings | GET /api/instance, twice | `features.push` | Metadata warning | Health / dev login / authenticated me |
| --- | --- | --- | --- | --- |
| Matched pair, two packages | 200, exact public projection below | true | None | 200 / 200 / 200, same user |
| Both absent | 200, `firebase: null` | false | None | 200 / 200 / 200, same user |
| Service account only | 200, `firebase: null` | true | None | 200 / 200 / 200, same user |
| Mismatched projects | 200, `firebase: null` | true | Exactly one sanitized warning below | 200 / 200 / 200, same user |

The whole instance payload was checked for leakage of the synthetic account email, private key, token URI, extra Android fields/keys, and the mismatched project marker. The warning was checked for exact keys and values aside from its time.

```json
{
  "projectId": "synthetic-pace-e2e",
  "senderId": "123456789",
  "apps": [
    {"packageName": "example.synthetic.first", "appId": "synthetic-app-first", "apiKey": "synthetic-public-key-first"},
    {"packageName": "example.synthetic.second", "appId": "synthetic-app-second", "apiKey": "synthetic-public-key-second"}
  ]
}
```

```json
{"level":"warn","message":"Firebase Android metadata is unavailable","time":"2026-11-03T21:56:16.162Z","reason":"project-mismatch"}
```
