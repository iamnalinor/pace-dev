> Historical record, superseded by [HANDOFF.md](../HANDOFF.md); kept for its evidence, not as current status.

# OTA immutable release staging and channel promotion

Implemented a portable injected pipeline under `scripts/ota`: `store-types.ts`, `store-operations.ts`, `release-codec.ts`, `release-validation.ts`, `release-read.ts`, `publish-stage.ts`, and `publish-promote.ts`. Tests use `store-memory.fixtures.ts`; no real storage/network operation or publisher activation ran.

`ReleaseStore` exposes reads, immutable `putIfAbsent`, and channel `compareAndSwap` with an explicit expected ETag, including null for confirmed absence. Adapters report fixed unavailable errors; helper boundaries sanitize thrown failures. The real service adapter remains root-owned.

`stageRelease` requires complete captured export bytes and a previously signed manifest. It reconstructs expected manifest asset descriptors/URLs from export metadata, verifies exact completeness and identities, recomputes each captured asset's SHA-256 through WebCrypto, and writes content-addressed assets, exact manifest bytes and an immutable runtime/update release record. Every object is read back and compared before staging succeeds. Identical retries preserve objects/ETags; differing collisions fail. This layer preserves and structurally validates the signing output; native certificate verification remains a separate requirement.

`promoteRelease` reloads the immutable record/manifest, checks their digests and asset descriptors, and re-verifies asset bytes before the only mutable operation: channel CAS. It uses stored release metadata rather than caller-mutated staged fields. A failed stage cannot change a channel; stale/concurrent ETags cannot overwrite another publisher. A rollback to older code requires repackaging it with a new UUID and newer createdAt, rather than moving the pointer to an older update the Expo client would reject.

`selectRelease` isolates exact runtime/channel keys and returns the original signed bytes/header plus pointer ETag. Only confirmed channel absence means no update; malformed pointers, unavailable storage, missing objects, mismatched identities or altered content remain explicit errors. Normal reads verify the immutable record and manifest; promotion verifies every asset. Objects must remain immutable and retained while releases can be served.

TDD: initial tests observed missing-module RED; initial GREEN was 7 tests. A caller-mutated timestamp regression then reproduced RED (7 pass, 1 fail); promotion now compares authoritative stored metadata. Latest `bun test scripts/ota`: **53 pass, 0 fail, 102 assertions across 5 files**, `/tmp/pace-ota-publication-green.log` (8 publication tests plus 45 prior manifest/signing/protocol tests).

Per root instruction, existing OTA helpers received narrow lint-preparation changes: boolean helper names use is/has prefixes, schemas were flattened, `z.output` replaces schema internals, and `contentTypeForExtension` exports the same own-property-safe MIME map for the service adapter. No lint or Git mutation ran in this task. Independent review, actual R2 behavior, signing certificate/native interoperability, fingerprint checks and release activation remain separate gates.
