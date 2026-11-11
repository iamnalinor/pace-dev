> Historical plan; see [HANDOFF.md](HANDOFF.md) for status. Unchecked boxes and listed files are not a claim about the current tree.

# Infrastructure ports: first checkpoint

Scope: extract request provenance only. Cloudflare remains the deployed host. Database,
actor, scheduler, live channel, KV, assets and alternate hosts remain later checkpoints.

1. Preserve the portable RequestPlace value (nullable ip/country/city/userAgent) and
   UNKNOWN_PLACE. Add a RequestPlaceReader port with read(request: Request): RequestPlace.
2. Write a failing shared-reader test with an injected reader and a plain Request. Move
   existing metadata/512-character tests to the Cloudflare adapter without changing assertions.
3. Move Cloudflare metadata/header extraction into platform/cloudflare/request-place.ts;
   shared requestPlace delegates to its injected reader. App composition installs the reader
   per request; root agent owns app, environment and auth caller wiring.
4. Write real ESLint lintText tests for portable scope: direct/computed/destructured cf,
   Cloudflare.Env, D1Database, DurableObjectStorage, WebSocketPair and Cloudflare/D1 imports.
   Verify failures, then add AST selectors and import restrictions in resolved ESLint config.
5. Extend dependency-cruiser: portable files cannot import platform; platform composes
   existing features without weakening feature-to-feature isolation. Explicit converted-file
   scope begins at shared/request-place.ts and shared/ports; unconverted files are listed
   as migration debt, not blanket exemptions claimed as final architecture.
6. Run targeted API and lint-boundary tests. Root integrates, runs bun lint and broad
   regression checks, obtains review, and owns commit/PR/checkpoints. No QA/emulator here.

Migration inventory: shared/app-env.ts and config.ts; shared/db; shared/push;
shared/user-store-of.ts; auth; bot; sync; mcp; user-store; worker.ts and app.ts still
contain platform coupling and are not represented as portable by this checkpoint.
