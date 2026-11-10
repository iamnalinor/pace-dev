import { err, nextDayStartIn, ok, type Result } from "@pace/core";

import { sha256BytesHex } from "../shared/crypto.ts";
import { armEarliest } from "./alarm.ts";
import { encodeArchiveMonth, verifyArchiveMonth } from "./archive-codec.ts";
import {
  type ArchiveError,
  type CaptureInput,
  isEligible,
  isEqualBytes,
  type Options,
  readArchiveObject,
  validateStagedArchive,
} from "./archive-policy.ts";
import { type ArchiveOperation, ArchiveRepository } from "./archive-repository.ts";
import {
  archiveSourceMonths,
  captureArchiveSource,
  type MonthFingerprint,
  monthFingerprint,
} from "./archive-source.ts";
import {
  type ArchiveIdentity,
  ArchiveIdentitySchema,
  type PreparedArchiveMonth,
} from "./archive-types.ts";
import { storeIdOf } from "./store-identity.ts";

export type { ArchiveError } from "./archive-policy.ts";
const NEXT_KEY = "archive:next-at";

/** Copy-only archive work runs inside the actor's serialized RPC/alarm call, never waitUntil. */
export class ArchiveService {
  readonly #options: Options;
  readonly #repository: ArchiveRepository;
  constructor(options: Options) {
    this.#options = options;
    this.#repository = new ArchiveRepository(options.storage);
  }

  async #authority(storeId?: string): Promise<Result<string, ArchiveError>> {
    if (this.#options.owner === undefined) {
      return err("archive/owner-required");
    }
    if (!this.#options.canWrite()) {
      return err("archive/stale");
    }
    const current = await storeIdOf(this.#options.storage);
    return storeId === undefined || current === storeId ? ok(current) : err("archive/stale");
  }

  async #put(key: string, bytes: Uint8Array, storeId: string): Promise<Result<void, ArchiveError>> {
    const authority = await this.#authority(storeId);
    if (!authority.ok) {
      return authority;
    }
    const archive = this.#options.archive;
    if (archive === undefined) {
      return err("archive/unavailable");
    }
    await this.#options.storage.put("archive:ever", true);
    const result = await archive.putIfAbsent(key, bytes);
    return result.ok ? ok(undefined) : result;
  }

  async #upload(prepared: PreparedArchiveMonth): Promise<Result<void, ArchiveError>> {
    const { manifest } = prepared;
    const put = await this.#put(manifest.dataKey, prepared.bytes, manifest.storeId);
    if (!put.ok) {
      return put;
    }
    const remote = await readArchiveObject(this.#options.archive, manifest.dataKey);
    if (!remote.ok) {
      return err("archive/unavailable");
    }
    if (!isEqualBytes(remote.value, prepared.bytes)) {
      return err("archive/integrity");
    }
    const verified = await verifyArchiveMonth(manifest, remote.value, manifest);
    return verified.ok
      ? await this.#put(prepared.manifestKey, prepared.manifestBytes, manifest.storeId)
      : verified;
  }

  async #verify(prepared: PreparedArchiveMonth): Promise<Result<void, ArchiveError>> {
    const manifest = await readArchiveObject(this.#options.archive, prepared.manifestKey);
    if (!manifest.ok) {
      return err("archive/unavailable");
    }
    if (!isEqualBytes(manifest.value, prepared.manifestBytes)) {
      return err("archive/integrity");
    }
    const bytes = await readArchiveObject(this.#options.archive, prepared.manifest.dataKey);
    if (!bytes.ok) {
      return err("archive/unavailable");
    }
    const verified = await verifyArchiveMonth(prepared.manifest, bytes.value, prepared.manifest);
    return verified.ok ? ok(undefined) : verified;
  }

  async #validateOperation(operation: ArchiveOperation): Promise<Result<void, ArchiveError>> {
    const authority = await this.#authority(operation.prepared.manifest.storeId);
    if (!authority.ok) {
      return authority;
    }
    if (operation.prepared.manifest.owner !== this.#options.owner) {
      return err("archive/integrity");
    }
    return await validateStagedArchive(operation);
  }

  async #advanceOperation(operation: ArchiveOperation): Promise<Result<void, ArchiveError>> {
    if (operation.stage === "prepared") {
      const uploaded = await this.#upload(operation.prepared);
      if (!uploaded.ok) {
        return uploaded;
      }
      this.#repository.stage(operation.id, "uploaded");
    }
    if (operation.stage !== "verified") {
      const verified = await this.#verify(operation.prepared);
      if (!verified.ok) {
        return verified;
      }
      this.#repository.stage(operation.id, "verified");
    }
    return ok(undefined);
  }

  async #resume(operation: ArchiveOperation): Promise<Result<ArchiveOperation, ArchiveError>> {
    const validated = await this.#validateOperation(operation);
    if (!validated.ok) {
      return validated;
    }
    if (operation.stage === "committed") {
      return ok(operation);
    }
    const advanced = await this.#advanceOperation(operation);
    if (!advanced.ok) {
      return advanced;
    }
    const current = await this.#authority(operation.prepared.manifest.storeId);
    if (!current.ok) {
      return current;
    }
    this.#repository.commit(operation);
    return ok({ ...operation, stage: "committed" });
  }

  async #schedule(at: number): Promise<void> {
    await this.#options.storage.put(NEXT_KEY, at);
    await armEarliest(this.#options.storage, at);
  }

  async #prepare(
    identity: ArchiveIdentity,
    fingerprint: MonthFingerprint,
  ): Promise<Result<ArchiveOperation, ArchiveError>> {
    const source = captureArchiveSource(this.#options.storage, identity.month);
    const prepared = await encodeArchiveMonth({
      ...identity,
      sourceSchemaTag: this.#options.sourceSchemaTag,
      capturedThroughSeq: source.sourceHighSeq,
      rawRevision: source.rawRevision,
      records: source.records,
    });
    if (!prepared.ok) {
      return prepared;
    }
    const id = await sha256BytesHex(prepared.value.manifestBytes);
    const current = await this.#authority(identity.storeId);
    if (!current.ok) {
      return current;
    }
    return this.#repository.prepare(id, prepared.value, fingerprint)
      ? ok({
          id,
          stage: "prepared",
          prepared: prepared.value,
          fingerprint,
          attempts: 0,
          nextAttemptAt: 0,
        })
      : err("archive/stale");
  }

  async #pendingFingerprint(input: CaptureInput): Promise<string | undefined> {
    if (!isEligible(input)) {
      return undefined;
    }
    const current = monthFingerprint(this.#options.storage, input.month);
    const authority = await this.#authority();
    if (
      !authority.ok ||
      this.#repository.isCurrent({
        ...current,
        month: input.month,
        schema: this.#options.sourceSchemaTag,
        owner: this.#options.owner ?? "",
        storeId: authority.value,
      })
    ) {
      return undefined;
    }
    const fingerprint = JSON.stringify({ ...current, schema: this.#options.sourceSchemaTag });
    return this.#repository.isBlocked(input.month, fingerprint) ? undefined : fingerprint;
  }

  async #maintainMonth(input: CaptureInput): Promise<void> {
    const fingerprint = await this.#pendingFingerprint(input);
    if (fingerprint === undefined) {
      return;
    }
    const prepared = await this.captureArchiveMonth(input);
    if (!prepared.ok) {
      if (prepared.error === "archive/invalid" || prepared.error === "archive/too-large") {
        this.#repository.block(input.month, fingerprint, prepared.error);
      }
      return;
    }
    if (
      prepared.value.stage !== "committed" &&
      prepared.value.nextAttemptAt <= Date.parse(input.now)
    ) {
      await this.resumeArchiveOperation(prepared.value.id, input.now);
    }
  }

  async captureArchiveMonth(input: CaptureInput): Promise<Result<ArchiveOperation, ArchiveError>> {
    if (this.#options.archive === undefined) {
      return err("archive/unavailable");
    }
    const authority = await this.#authority();
    if (!authority.ok) {
      return authority;
    }
    const identity = ArchiveIdentitySchema.safeParse({
      owner: this.#options.owner,
      storeId: authority.value,
      month: input.month,
    });
    if (!identity.success || !isEligible(input)) {
      return err("archive/invalid");
    }
    const fingerprint = monthFingerprint(this.#options.storage, input.month);
    const existing = this.#repository.matching(input.month, {
      ...fingerprint,
      schema: this.#options.sourceSchemaTag,
    });
    if (!existing.ok) {
      return existing;
    }
    return existing.value === undefined
      ? await this.#prepare(identity.data, fingerprint)
      : ok(existing.value);
  }

  async resumeArchiveOperation(
    id: string,
    now: string,
  ): Promise<Result<ArchiveOperation, ArchiveError>> {
    const loaded = this.#repository.load(id);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.value === undefined) {
      return err("archive/not-found");
    }
    const result = await this.#resume(loaded.value);
    if (!result.ok && result.error !== "archive/stale") {
      await this.#schedule(this.#repository.retry(loaded.value, result.error, now));
    }
    return result;
  }

  async schedule(): Promise<void> {
    if (
      this.#options.archive !== undefined &&
      this.#options.canWrite() &&
      (await this.#options.storage.get(NEXT_KEY)) === undefined
    ) {
      await this.#schedule(Date.now());
    }
  }

  async atAlarm(now: string, timezone: string): Promise<void> {
    if (this.#options.archive === undefined || !this.#options.canWrite()) {
      return;
    }
    const next = await this.#options.storage.get<number>(NEXT_KEY);
    if (next !== undefined && next > Date.parse(now)) {
      await armEarliest(this.#options.storage, next);
      return;
    }
    for (const id of this.#repository.due(now)) {
      await this.resumeArchiveOperation(id, now);
    }
    for (const month of archiveSourceMonths(this.#options.storage)) {
      await this.#maintainMonth({ month, now, timezone });
    }
    const retry = this.#options.storage.sql
      .exec<{ next: null | number }>(
        "SELECT min(next_attempt_at) AS next FROM _history_archive_operations WHERE stage <> 'committed' AND next_attempt_at > ?",
        Date.parse(now),
      )
      .toArray()[0]?.next;
    const daily = Date.parse(nextDayStartIn(now, timezone));
    await this.#schedule(Math.min(daily, retry ?? Infinity));
  }
}
