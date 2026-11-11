> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# Infrastructure ports: first checkpoint report

Implemented the request provenance port only: nullable RequestPlace values and a
RequestPlaceReader.read(Request) contract live under shared/ports; the shared helper
uses the injected reader. A pure unknown reader serves direct apps without a host.
The Cloudflare adapter alone extracts cf metadata and CF-Connecting-IP, preserving
empty/non-string normalization and the existing 512-character User-Agent bound.
Auth callers obtain the reader from request context; application/Worker wiring is
owned by the integrating agent.

The previous metadata tests moved to the Cloudflare adapter with their assertions
unchanged. Auth integration assertions remain unchanged. The new shared test proves
an injected reader receives this request and overrides raw request metadata.

Architecture guards cover the converted helper and every new shared port. Actual
ESLint lintText checks exercise member/computed/destructured cf, Cloudflare.Env,
D1Database, DurableObjectStorage, WebSocketPair, type-only Cloudflare imports, and
drizzle-orm/d1. Platform composition is allowed while existing feature isolation
remains and features cannot import platform directly. This is incremental scope;
the implementation plan lists unconverted areas. It does not claim the remaining
server is portable, or implement any alternate host.

Verification observed on 2026-11-05:
- Shared injected-reader RED: exit 1, one real assertion failure (original helper
  returned header data instead of the injected value), using a temporary Vitest
  config without workerd after the restricted runtime denied loopback.
- Shared injected-reader GREEN: exit 0, one passed test at that point.
- ESLint AST boundary RED: exit 1, 12 failing cases and one permitted-code pass.
- ESLint AST boundary GREEN: exit 0, 13 passed cases; seven unrelated cases filtered.
- Real workerd run with local loopback authorization: the shared/adapter files
  passed; auth integration failed while root's app injection was still pending
  (undefined reader). This intermediate result is not an accepted checkpoint.

Root integrated the reader through app/env/worker. The subsequent real-workerd run
passed all 81 cases across request-place, auth, Firebase policy and readiness;
the unchanged auth assertions passed. Unified lint and full regression are running.
No QA, emulator or production actions were performed.
