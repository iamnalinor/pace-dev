/**
Text typed into a field and not yet sent, kept on this device so a reload or an app restart does
not lose it (feedback 5 item 7). Local only: never synced, never sent to the server. One record
holds one session's drafts (`ownerTag`); another session's first draft replaces it, and signing out
forgets it (bug-lessons 103).
*/

/** The device's one slot for the drafts' record (localStorage on the web, SQLite on a phone). */
export type DraftStorage = {
  readonly read: () => null | string;
  readonly write: (value: string) => void;
  readonly clear: () => void;
};

/** A draft: what is typed, and the value the field opened with (an edit is an edit of something). */
export type Draft = { readonly text: string; readonly base: string };

type Entry = Draft & { readonly at: number };
type Book = { readonly owner: string; readonly entries: Readonly<Record<string, Entry>> };

/** Drafts not touched for 30 days are dropped. */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/** The newest drafts kept; older ones go first. */
const MAX_ENTRIES = 50;

const isEntry = (value: unknown): value is Entry =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Entry).text === "string" &&
  typeof (value as Entry).base === "string" &&
  typeof (value as Entry).at === "number";

const parseBook = (raw: null | string): Book | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const { entries, owner } = parsed as { readonly entries?: unknown; readonly owner?: unknown };
    if (typeof owner !== "string" || typeof entries !== "object" || entries === null) {
      return null;
    }
    return {
      entries: Object.fromEntries(
        Object.entries(entries as Record<string, unknown>).filter((pair): pair is [string, Entry] =>
          isEntry(pair[1]),
        ),
      ),
      owner,
    };
  } catch {
    return null;
  }
};

/** The book's drafts for `owner`, without the stale ones and past the cap. */
const freshEntries = (
  book: Book | null,
  owner: string,
  now: number,
): Readonly<Record<string, Entry>> => {
  if (book?.owner !== owner) {
    return {};
  }
  const fresh = Object.entries(book.entries)
    .filter(([, entry]) => now - entry.at <= DRAFT_MAX_AGE_MS)
    .toSorted(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(fresh);
};

export type DraftBook = {
  readonly read: (owner: string, key: string) => Draft | null;
  readonly write: (owner: string, key: string, draft: Draft) => void;
  readonly remove: (owner: string, key: string) => void;
  /** Forgets every draft (sign-out). */
  readonly forget: () => void;
};

export const createDraftBook = ({
  now = Date.now,
  storage,
}: {
  readonly storage: DraftStorage;
  readonly now?: () => number;
}): DraftBook => {
  const load = (owner: string) => {
    try {
      return freshEntries(parseBook(storage.read()), owner, now());
    } catch {
      return {};
    }
  };
  const save = (owner: string, entries: Readonly<Record<string, Entry>>): void => {
    try {
      if (Object.keys(entries).length === 0) {
        storage.clear();
      } else {
        const kept = freshEntries({ entries, owner }, owner, now());
        storage.write(JSON.stringify({ entries: kept, owner }));
      }
    } catch {
      // A store that refuses keeps nothing; the field still holds the text.
    }
  };
  return {
    forget: () => {
      try {
        storage.clear();
      } catch {
        // Nothing kept to forget.
      }
    },
    read: (owner, key) => {
      const entry = load(owner)[key];
      return entry === undefined ? null : { base: entry.base, text: entry.text };
    },
    remove: (owner, key) => {
      const entries = load(owner);
      if (!Object.hasOwn(entries, key)) {
        return;
      }
      save(
        owner,
        Object.fromEntries(Object.entries(entries).filter(([entryKey]) => entryKey !== key)),
      );
    },
    write: (owner, key, draft) => {
      save(owner, { ...load(owner), [key]: { ...draft, at: now() } });
    },
  };
};

/**
The session a draft belongs to, by a digest of its token (FNV-1a, 32 bits): a tag that tells two
sessions apart without keeping the token itself next to the drafts. `null` signed out. Drafts are
per session, not per account, on purpose: every way a session ends here (a Log out, a token found
expired at start) forgets every draft anyway (`app-state.tsx`), so an account key would keep
nothing more today, and a new sign-in (maybe another person on a shared phone) starts empty.
*/
export const ownerTag = (session: string | undefined): null | string => {
  if (session === undefined || session === "") {
    return null;
  }
  let hash = 0x81_1c_9d_c5;
  for (const char of session) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // The unsigned 32-bit value.
  return `s${(hash >>> 0).toString(36)}`;
};
