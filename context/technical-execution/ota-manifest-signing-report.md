# OTA manifest/signing implementation slice

Implemented in `scripts/ota` after initial isolated staging under `/tmp/pace-ota-implementation` and checkpoint `db38aeb`. No dependencies, app/native configuration, publisher, fingerprint policy, release workflow or production objects changed.

Public interfaces:

- `parseExportMetadata(unknown)` validates the pinned Expo CLI metadata v0/Metro Android bundle/assets shape, canonical relative paths, unique paths and explicit MIME support.
- `readExport(directory)` reads metadata and complete regular-file artifacts through contained real paths and opened-file identity checks, returning captured bytes, MD5 compatibility keys and SHA-256 base64url integrity hashes. The export is a private immutable CI staging snapshot: concurrent mutation by another writer is outside this portable IO contract. No Linux-specific gate was added.
- `createManifest(options, artifacts)` builds deterministic UUID/date/runtime/HTTPS asset references, verifies exact asset completeness and digest shapes, preserves explicit public extras and orders assets consistently. Pure metadata/manifest validation imports no filesystem or crypto implementation.
- `signManifest(bytes,{privateKeyPem,keyId})` validates the manifest, copies caller-owned bytes, accepts RSA keys of at least 2048 bits, and signs exact UTF-8 bytes with SHA-256/PKCS#1 v1.5. Header fields are constrained and errors fixed; production keys are never read implicitly.
- `manifestResponse(signedArtifact|null, request)` provides exact signed JSON or multipart manifest parts, correct protocol headers/bodyless 204 negotiation, and rejects incompatible runtime/platform/protocol. Explicit MIME q=0 exclusions override wildcard acceptance.

TDD evidence: initial missing implementation modules produced RED in three test files; protocol tests separately observed missing-module RED. The multipart test now checks the complete byte envelope and verifies the extracted signed body independently with WebCrypto. No deprecated server form-data parser or additional dependency is used; this is not Expo Android parser interoperability evidence. Further RED caught q=0 precedence and inherited `constructor` MIME lookup; both were fixed. The MIME guard now requires an own string-valued mapping. Existing tests missed that class because they exercised arbitrary unknown extensions rather than inherited object names; this regression guards the extension lookup class.

Latest repository GREEN: `bun test scripts/ota` — **45 pass, 0 fail, 76 assertions across four files**, `/tmp/pace-ota-repo-green.log` (678 ms). Tests include file/ancestor symlink escape, missing/directory assets, metadata/path/digest/input failures, deterministic output, independent WebCrypto signature verification, tampering/wrong keys, weak/non-RSA keys, no private-key leakage, runtime/platform negotiation and multipart byte preservation. Ephemeral keys exist only in test memory.

This is a usable manifest/signing slice, not completion of OTA or implementation-plan section 1. Actual Expo export execution, fingerprint comparisons, certificate/native verifier interoperability, signed directives, publisher storage/activation and device recovery evidence remain outstanding. Root owns lint and independent review.
