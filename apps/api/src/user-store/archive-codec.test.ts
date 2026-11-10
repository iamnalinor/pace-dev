import { describe, expect, it } from "vitest";

import type { ArchiveManifest, ArchiveRecord } from "./archive-types.ts";

import { encodeArchiveMonth, verifyArchiveMonth } from "./archive-codec.ts";

const event = (seq = 1): Extract<ArchiveRecord, { kind: "event" }> => ({
  kind: "event",
  seq,
  row: {
    id: `historical:${seq}`,
    type: "unknown.historical",
    occurredAt: "2026-01-04T01:00:00.000Z",
    recordedAt: "2026-02-01T00:00:00.000Z",
    deviceId: "phone",
    precision: "exact",
    source: "web",
    payload: '{"text":"Привет 🌙","targetId":"missing"}',
  },
});
const usage: ArchiveRecord = {
  kind: "usage",
  revision: 4,
  row: {
    deviceId: "phone",
    deviceName: "Телефон",
    app: "Pace",
    startAt: "2026-01-31T23:00:00.000Z",
    endAt: "2026-02-01T01:00:00.000Z",
  },
};
const phone: ArchiveRecord = {
  kind: "phone-use",
  revision: 5,
  row: {
    deviceId: "phone",
    startAt: "2026-01-02T00:00:00.000Z",
    endAt: "2026-01-02T01:00:00.000Z",
  },
};
const identity = { owner: "owner/a", storeId: "generation/b", month: "2026-01" };
const input = (records: readonly ArchiveRecord[] = [event(), usage, phone]) => ({
  ...identity,
  sourceSchemaTag: "events-v1",
  capturedThroughSeq: 9,
  rawRevision: 5,
  records,
});
const encoded = async (records?: readonly ArchiveRecord[]) => {
  const result = await encodeArchiveMonth(input(records));
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const forge = async (plain: Uint8Array, manifest: ArchiveManifest) => {
  const hash = async (bytes: Uint8Array) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  const stream = new Blob([Uint8Array.from(plain).buffer]).stream();
  const zipped = stream.pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(zipped).arrayBuffer());
  const compressedSha256 = await hash(compressed);
  return {
    bytes: compressed,
    manifest: {
      ...manifest,
      compressedSha256,
      compressedByteLength: compressed.byteLength,
      uncompressedSha256: await hash(plain),
      uncompressedByteLength: plain.byteLength,
      dataKey: manifest.dataKey.replace(manifest.compressedSha256, () => compressedSha256),
    },
  };
};

describe("archive codec", () => {
  it("preserves opaque historical envelopes and raw revisions in a deterministic UTC partition", async () => {
    const first = await encoded([phone, usage, event(7), event(1)]);
    const second = await encoded([event(1), usage, event(7), phone]);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.dataKey).toMatch(
      /^history\/v1\/owner%2Fa\/generation%2Fb\/months\/2026-01\/[\da-f]{64}\.jsonl\.gz$/u,
    );
    expect(first.manifest.counts).toEqual({ events: 2, usage: 1, phoneUses: 1 });
    expect(first.manifest.minSeq).toBe(1);
    expect(first.manifest.maxSeq).toBe(7);
    const verified = await verifyArchiveMonth(first.manifest, first.bytes, identity);
    expect(verified).toEqual({
      ok: true,
      value: { manifest: first.manifest, records: [event(1), event(7), usage, phone] },
    });
  });

  it("retains correction payload text without rewriting or requiring its target", async () => {
    const source = event();
    const correction: ArchiveRecord = {
      ...source,
      row: {
        ...source.row,
        type: "event.amended",
        payload: '{ "targetId": "future", "patch": { "title": "До" } }',
      },
    };
    const copy = await encoded([correction]);
    expect(await verifyArchiveMonth(copy.manifest, copy.bytes, identity)).toEqual({
      ok: true,
      value: { manifest: copy.manifest, records: [correction] },
    });
  });

  it.each([
    [event(), event()],
    [event(), { ...event(), row: { ...event().row, id: "another-id" } }],
    [event(), { ...event(2), row: { ...event().row, id: "historical:1" } }],
    [usage, usage],
    [phone, phone],
    [{ ...usage, revision: 6 }],
    [{ ...event(), seq: 10 }],
    [{ ...phone, row: { ...phone.row, startAt: "2026-02-01T00:00:00.000Z" } }],
  ])(
    "refuses duplicate identities and rows beyond the capture or partition %#",
    async (...records) => {
      expect(await encodeArchiveMonth(input(records))).toEqual({
        ok: false,
        error: "archive/invalid",
      });
    },
  );

  it.each(["owner", "storeId", "month"] as const)(
    "refuses a different expected %s",
    async (field) => {
      const copy = await encoded();
      expect(
        await verifyArchiveMonth(copy.manifest, copy.bytes, { ...identity, [field]: "wrong" }),
      ).toEqual({ ok: false, error: "archive/integrity" });
    },
  );

  it.each([
    { formatVersion: 2 },
    { counts: { events: 2, usage: 1, phoneUses: 1 } },
    { uncompressedByteLength: 1 },
    { compressedByteLength: 1 },
    { uncompressedSha256: "0".repeat(64) },
    { compressedSha256: "0".repeat(64) },
    { dataKey: "history/v1/other/g/months/2026-01/key.jsonl.gz" },
    { surprise: true },
    { maxSeq: 9 },
    { capturedThroughSeq: 0 },
    { rawRevision: 0 },
  ])("refuses manifest tampering %#", async (patch) => {
    const copy = await encoded();
    expect(await verifyArchiveMonth({ ...copy.manifest, ...patch }, copy.bytes, identity)).toEqual({
      ok: false,
      error: "archive/integrity",
    });
  });

  it("rejects corrupt and truncated gzip bytes", async () => {
    const copy = await encoded();
    for (const bytes of [new Uint8Array([1, 2, 3]), copy.bytes.slice(0, -5)]) {
      expect(await verifyArchiveMonth(copy.manifest, bytes, identity)).toEqual({
        ok: false,
        error: "archive/integrity",
      });
    }
  });

  it.each([
    JSON.stringify(event()), // Missing final newline.
    `${JSON.stringify(event())}\n${JSON.stringify(event())}\n`,
    `${JSON.stringify({ ...event(), seq: 0 })}\n`,
    `${JSON.stringify({ ...event(), kind: "future-format" })}\n`,
    `${JSON.stringify({ ...event(), extra: true })}\n`,
    `{\n`,
  ])("validates decompressed JSONL even when byte hashes are authentic %#", async (text) => {
    const base = await encoded([event()]);
    const copy = await forge(new TextEncoder().encode(text), base.manifest);
    expect(await verifyArchiveMonth(copy.manifest, copy.bytes, identity)).toEqual({
      ok: false,
      error: "archive/integrity",
    });
  });

  it("refuses invalid UTF-8 after authenticated decompression", async () => {
    const base = await encoded([event()]);
    const copy = await forge(new Uint8Array([0xff, 10]), base.manifest);
    expect(await verifyArchiveMonth(copy.manifest, copy.bytes, identity)).toEqual({
      ok: false,
      error: "archive/integrity",
    });
  });

  it("bounds gzip expansion even if the manifest understates its size", async () => {
    const base = await encoded([event()]);
    const copy = await forge(new Uint8Array(16 * 1024 * 1024 + 1), base.manifest);
    expect(
      await verifyArchiveMonth(
        { ...copy.manifest, uncompressedByteLength: 1 },
        copy.bytes,
        identity,
      ),
    ).toEqual({ ok: false, error: "archive/too-large" });
  });

  it("verifies Unicode bytes after persisted chunks are reassembled", async () => {
    const source = event();
    const record = {
      ...source,
      row: { ...source.row, payload: JSON.stringify({ text: "Я🌙".repeat(20_000) }) },
    };
    const copy = await encoded([record]);
    const stream = new Blob([Uint8Array.from(copy.bytes).buffer]).stream();
    const inflated = stream.pipeThrough(new DecompressionStream("gzip"));
    const plain = new Uint8Array(await new Response(inflated).arrayBuffer());
    const split = plain.indexOf(0xd0) + 1;
    const rebuilt = new Uint8Array(plain.byteLength);
    rebuilt.set(plain.slice(0, split));
    rebuilt.set(plain.slice(split), split);
    const replay = await forge(rebuilt, copy.manifest);
    const result = await verifyArchiveMonth(replay.manifest, replay.bytes, identity);
    expect(result.ok && result.value.records).toEqual([record]);
    expect(copy.manifest.uncompressedByteLength).toBe(plain.byteLength);
  });

  it.each([
    { ...phone, row: { ...phone.row, endAt: phone.row.startAt } },
    { ...phone, row: { ...phone.row, endAt: "2025-12-01T00:00:00.000Z" } },
    { ...usage, row: { ...usage.row, endAt: usage.row.startAt } },
    { ...usage, row: { ...usage.row, endAt: "2025-12-01T00:00:00.000Z" } },
    {
      ...event(),
      row: {
        id: "",
        type: "",
        occurredAt: "2026-01-legacy",
        recordedAt: "",
        deviceId: "",
        precision: "",
        source: "",
        payload: "",
      },
    },
    {
      ...usage,
      row: { deviceId: "", deviceName: "", app: "", startAt: "2026-01-legacy", endAt: "" },
    },
  ])(
    "preserves stored SQL text without applying current business validation %#",
    async (record) => {
      const copy = await encoded([record]);
      expect(await verifyArchiveMonth(copy.manifest, copy.bytes, identity)).toEqual({
        ok: true,
        value: { manifest: copy.manifest, records: [record] },
      });
    },
  );

  it("compares instants across differing UTC timestamp precision", async () => {
    const row = {
      ...phone,
      row: { ...phone.row, startAt: "2026-01-02T00:00:00Z", endAt: "2026-01-02T00:00:00.001Z" },
    };
    expect((await encodeArchiveMonth(input([row]))).ok).toBe(true);
  });

  it("refuses malformed UTF-16 ownership without throwing", async () => {
    expect(await encodeArchiveMonth({ ...input(), owner: "bad\u{D800}" })).toEqual({
      ok: false,
      error: "archive/invalid",
    });
  });

  it("bounds uncompressed UTF-8 bytes before compression", async () => {
    const source = event();
    const large = { ...source, row: { ...source.row, payload: "я".repeat(8 * 1024 * 1024) } };
    expect(await encodeArchiveMonth(input([large]))).toEqual({
      ok: false,
      error: "archive/too-large",
    });
  });
});
