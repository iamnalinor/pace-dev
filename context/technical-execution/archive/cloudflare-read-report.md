> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Authenticated Cloudflare read adapter

Implemented `scripts/deploy/cloudflare-read.ts`, `cloudflare-http.ts`, `cloudflare-schemas.ts` and fake-fetch tests. `createCloudflareReader({target,apiToken,fetch,timeoutMs})` returns `readSnapshot` and `resolveVersionOrigin` compatible with the probe adapter. No deployment or account API operation ran; all adapter execution used fake fetch. Official documentation browsing and pinned Wrangler source inspection were read-only.

## Evidence and API contract

Installed Wrangler is exactly 4.156.0 (`apps/api/node_modules/wrangler/package.json`). Its `getWorkerSubdomain` reads `/accounts/{account}/workers/workers/{name}` and consumes `subdomain.previews_enabled` plus `preview_url_suffix`. The upload path forms `https://${versionId.slice(0,8)}${preview_url_suffix}` only when a preview is available. `fetchLatestDeployment` selects the first deployment; `versionsSecretListHandler --latest-version` independently selects the first item of the versions list.

The adapter uses fixed `https://api.cloudflare.com/client/v4` GET endpoints:

- `/accounts/{account}`: require successful authenticated account authorization and exact returned account ID. This intentionally requires Account Read in addition to Worker read permissions; denial has no weaker fallback.
- `/accounts/{account}/workers/workers/{name}`: require matching returned Worker name and a canonical nonempty provider ID.
- `/accounts/{account}/workers/scripts/{name}/deployments`: validate `result.deployments[0]`, its UUID deployment/version identities, percentage strategy and traffic entries.
- `/accounts/{account}/workers/scripts/{name}/versions`: validate independent `result.items[0]` as the latest UUID version. Preserve split traffic/latest drift for pure preflight to reject.
- `/accounts/{account}/workers/scripts/{name}/versions/{version}`: require exact returned version ID and explicit `metadata.hasPreview === true` before preview resolution. The GET schema uses camel-case `hasPreview`, unlike Wrangler's upload response field `has_preview`.

Confirmed absence requires successful prior account authorization, Worker HTTP 404, `success:false`, and a nonempty error array containing only Worker-not-found code 10007. Plain/malformed/authentication 404 responses, mixed error codes, empty lists and network failures never become absence. No secrets endpoint is read. Results expose only sanitized snapshot identities/traffic or an origin; provider messages, author fields, bindings and raw bodies are not returned.

HTTP operations reject redirects and unexpected response URLs, use explicit bearer credentials only at the fixed API host, and share a bounded operation deadline across all reads including body consumption. Responses are limited to 1 MiB. Invalid inputs, transport exceptions and malformed JSON return fixed errors.

## Capability correction: Pace remains gated

[Official Version URL documentation](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) explicitly excludes Workers implementing Durable Objects. The resolver returns `unsupported-version-preview` for unavailable capability or DO exports, even if another field unexpectedly claims preview availability. It never substitutes a user-supplied hostname or silently creates a 0% deployment. The HTTP probe adapter preserves this explicit failure without sending requests to a preview host. Conditional non-DO URL resolution is not evidence that Pace's DO-backed deployment path works.

[Cloudflare Previews](https://developers.cloudflare.com/workers/previews/) and [resource isolation](https://developers.cloudflare.com/workers/previews/resources/) provision separate DO namespaces/storage and Containers for each Preview. KV/D1/R2 require explicit separate bindings for isolation; service bindings still target production Workers. This is a viable isolated rehearsal mechanism, not proof of the exact candidate's effective production DO bindings.

[Version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/) can select a version already present in the current deployment, including 0%. Using that route would mutate deployment state before verification and needs a separate explicit design/protection decision. This adapter implements neither overrides nor an automatic fallback. Header visibility to Worker code, all alternative selectors, Access/proxy enforcement, bypass resistance and a real nonproduction rehearsal remain unproven.

API references: [Worker models including authenticated preview suffix](https://developers.cloudflare.com/api/resources/workers/), [deployment list ordering](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/), [version list](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/list/), [exact version metadata and DO exports](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/).

## Tests

RED observed before implementation: missing `cloudflare-read.ts` (2 failing test-file loads). GREEN: Cloudflare reader/preview tests plus existing HTTP probe tests — **74 pass, 0 fail, 170 assertions across 5 files** (`/tmp/pace-cloudflare-green.log`). Coverage includes authenticated absence versus auth/malformed responses, split traffic/latest drift, empty/malformed payloads, target/version mismatch, fixed credential host/manual redirects, stalled fetch/body, disabled/untrusted/DO preview capability and zero preview requests after unsupported capability.

Root owns lint and independent review. No QA, Android, Git mutation, live Cloudflare account API read/write, migration or deployment occurred.
