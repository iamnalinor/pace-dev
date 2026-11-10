import type { Download, Page } from "@playwright/test";

import { inflateRawSync } from "node:zlib";

import type { Event } from "@pace/core";

import { API_URL } from "./login.ts";
import { pushAsClient, ulid } from "./seed.ts";

/** A year of immutable source, including correction chains and a target arriving after its amendment. */
export const seedCheckpointYear = async (
  token: string,
): Promise<{
  readonly events: readonly Event[];
  readonly title: string;
  /** When the task was created: History at a minute later shows its creation first. */
  readonly createdAt: string;
  readonly storeId: string;
  readonly pending: Event;
}> => {
  const now = Date.now();
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(2);
  start.setUTCHours(9, 0, 0, 0);
  const title = `Year-old open task ${crypto.randomUUID().slice(0, 6)}`;
  const taskId = ulid(start.getTime());
  const envelope = (type: Event["type"], at: number, payload: unknown): Event => {
    // The real Worker validates every fixture; accepted IDs are checked below.
    return {
      id: ulid(at),
      type,
      occurredAt: new Date(at).toISOString(),
      recordedAt: new Date(at).toISOString(),
      deviceId: "checkpoint-seed",
      precision: "exact",
      source: "web",
      payload,
    } as Event;
  };
  const created = envelope("task.created", start.getTime(), {
    taskId,
    title,
    presetId: "personal",
    fields: {},
    subtasks: [],
  });
  const events: Event[] = [created];
  for (let month = 0; month < 12; month++) {
    for (let day = 0; day < 20; day++) {
      const at = new Date(start);
      at.setUTCMonth(start.getUTCMonth() + month);
      at.setUTCDate(day + 2);
      events.push(envelope("settings.updated", at.getTime(), { language: "en", timezone: "UTC" }));
    }
  }
  const update = envelope("task.updated", start.getTime() + 1000, {
    taskId,
    title: "Earlier title",
  });
  const amendment = envelope("event.amended", start.getTime() + 2000, {
    targetId: update.id,
    patch: { title },
  });
  const revoked = envelope("event.revoked", start.getTime() + 3000, { targetId: amendment.id });
  const restored = envelope("event.revoked", start.getTime() + 4000, { targetId: revoked.id });
  const future = envelope("settings.updated", start.getTime() + 6000, { language: "ru" });
  events.push(
    update,
    amendment,
    revoked,
    restored,
    envelope("event.amended", start.getTime() + 5000, {
      targetId: future.id,
      patch: { language: "en" },
    }),
    future,
  );
  const pushed = await pushAsClient(token, events);
  if (!pushed.ok) {
    throw new Error(`year seed failed: ${await pushed.text()}`);
  }
  const answer = (await pushed.json()) as {
    readonly accepted: readonly string[];
    readonly rejected: readonly unknown[];
  };
  if (answer.accepted.length !== events.length || answer.rejected.length > 0) {
    throw new Error("year seed lost source events");
  }
  const pulled = await fetch(`${API_URL}/api/sync/pull?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { storeId } = (await pulled.json()) as { readonly storeId: string };
  return {
    events,
    title,
    createdAt: created.occurredAt,
    storeId,
    pending: envelope("settings.updated", now - 1000, { language: "en" }),
  };
};

/** Install an offline outbox on the same confirmed generation before any application script runs. */
export const preparePendingCopy = async (
  page: Page,
  input: { readonly storeId: string; readonly pending: Event },
): Promise<void> => {
  await page.route("**/checkpoint-local-setup", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" });
  });
  await page.goto("/checkpoint-local-setup");
  await page.evaluate(async ({ storeId, pending }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open("pace", 2);
      request.addEventListener("upgradeneeded", () => {
        const events = request.result.createObjectStore("events", { keyPath: "id" });
        events.createIndex("byOccurredAt", "occurredAt");
        request.result.createObjectStore("pending", { keyPath: "id" });
        request.result.createObjectStore("meta", { keyPath: "key" });
        request.result.createObjectStore("sequences", { keyPath: "id" });
      });
      request.addEventListener("success", () => {
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        reject(new Error("Could not open local copy", { cause: request.error }));
      });
    });
    const tx = db.transaction(["events", "pending", "meta"], "readwrite");
    tx.objectStore("events").put(pending);
    tx.objectStore("pending").put({ id: pending.id });
    const metadata = Object.entries({
      storeId,
      cursor: "0",
      syncVersion: "1",
      coverage: "full",
      copyToken: crypto.randomUUID(),
    });
    for (const [key, value] of metadata) {
      tx.objectStore("meta").put({ key, value });
    }
    await new Promise<void>((resolve, reject) => {
      tx.addEventListener("complete", () => {
        resolve();
      });
      tx.addEventListener("abort", () => {
        reject(new Error("Local copy transaction aborted", { cause: tx.error }));
      });
    });
    db.close();
  }, input);
  await page.unroute("**/checkpoint-local-setup");
};

export const localHistoryImage = async (
  page: Page,
): Promise<{
  readonly coverage: string;
  readonly ids: readonly string[];
  readonly pending: number;
}> =>
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = globalThis.indexedDB.open("pace");
      opening.addEventListener("success", () => {
        resolve(opening.result);
      });
      opening.addEventListener("error", () => {
        reject(new Error("Could not open local copy", { cause: opening.error }));
      });
    });
    const tx = db.transaction(["events", "pending", "meta"], "readonly");
    const events = tx.objectStore("events").getAllKeys();
    const pending = tx.objectStore("pending").count();
    const coverage = tx.objectStore("meta").get("coverage");
    return await new Promise<{ coverage: string; ids: string[]; pending: number }>(
      (resolve, reject) => {
        tx.addEventListener("complete", () => {
          db.close();
          const stored: unknown = coverage.result;
          const value =
            typeof stored === "object" && stored !== null && "value" in stored
              ? stored.value
              : "full";
          resolve({
            coverage: typeof value === "string" ? value : "full",
            ids: events.result.map(String),
            pending: pending.result,
          });
        });
        tx.addEventListener("abort", () => {
          reject(new Error("Local copy transaction aborted", { cause: tx.error }));
        });
      },
    );
  });

const zipEntries = (bytes: Buffer): ReadonlyMap<string, string> => {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) {
    throw new Error("export is not a ZIP workbook");
  }
  const files = new Map<string, string>();
  let cursor = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    const method = bytes.readUInt16LE(cursor + 10);
    const size = bytes.readUInt32LE(cursor + 20);
    const nameSize = bytes.readUInt16LE(cursor + 28);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString();
    const local = bytes.readUInt32LE(cursor + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + size);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString());
    cursor += 46 + nameSize + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  return files;
};

const eventSheetRelationship = (files: ReadonlyMap<string, string>): string => {
  const sheet = (files.get("xl/workbook.xml") ?? "")
    .matchAll(/<sheet\b[^>]*\/>/gu)
    .find((match) => match[0].includes('name="events"'))?.[0];
  return /r:id="([^"]+)"/u.exec(sheet ?? "")?.[1] ?? "";
};

const eventSheetPath = (files: ReadonlyMap<string, string>): string => {
  const relationship = eventSheetRelationship(files);
  const target = (files.get("xl/_rels/workbook.xml.rels") ?? "")
    .matchAll(/<Relationship\b[^>]*\/>/gu)
    .find((match) => match[0].includes(`Id="${relationship}"`))?.[0];
  const part = /Target="([^"]+)"/u.exec(target ?? "")?.[1];
  if (part === undefined) {
    throw new Error("export events sheet is missing");
  }
  return part.startsWith("/") ? part.slice(1) : `xl/${part}`;
};

const textValue = (xml: string): string => /<t\b[^>]*>([\s\S]*?)<\/t>/u.exec(xml)?.[1] ?? "";
const eventCellId = (match: RegExpMatchArray, strings: readonly string[]): string => {
  return (match[1] ?? "").includes('t="s"')
    ? (strings[Number(/<v>(\d+)<\/v>/u.exec(match[2] ?? "")?.[1])] ?? "")
    : textValue(match[2] ?? "");
};
const eventIds = (files: ReadonlyMap<string, string>): readonly string[] => {
  const strings = (files.get("xl/sharedStrings.xml") ?? "")
    .matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)
    .map((match) => textValue(match[1] ?? ""))
    .toArray();
  const xml = files.get(eventSheetPath(files)) ?? "";
  return xml
    .matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)
    .filter((match) => /\br="A\d+"/u.test(match[1] ?? ""))
    .map((match) => eventCellId(match, strings))
    .filter((id) => id !== "id")
    .toArray();
};
const workbookChunk = (value: unknown): Buffer => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("export stream contains invalid bytes");
  }
  return Buffer.from(value);
};

/** Read the actual downloaded OpenXML artifact, following its named events-sheet relationship. */
export const exportedEventIds = async (download: Download): Promise<readonly string[]> => {
  const stream = await download.createReadStream();
  const chunks: readonly unknown[] = await stream.toArray();
  const bytes = Buffer.concat(chunks.map((chunk) => workbookChunk(chunk)));
  return eventIds(zipEntries(bytes));
};
