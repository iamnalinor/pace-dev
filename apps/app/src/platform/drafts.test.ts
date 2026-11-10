import { createDraftBook, DRAFT_MAX_AGE_MS, type DraftStorage, ownerTag } from "./drafts.ts";

const memoryStorage = (initial: null | string = null) => {
  const kept = { value: initial };
  const storage: DraftStorage = {
    clear: () => {
      kept.value = null;
    },
    read: () => kept.value,
    write: (value) => {
      kept.value = value;
    },
  };
  return { kept, storage };
};

const DAY = 24 * 60 * 60_000;

describe("the draft book (feedback 5 item 7)", () => {
  it("keeps a field's text and its base for the account that typed it", () => {
    const { storage } = memoryStorage();
    const book = createDraftBook({ now: () => 0, storage });
    book.write("alice", "now.line", { base: "", text: "Buy milk" });
    expect(book.read("alice", "now.line")).toEqual({ base: "", text: "Buy milk" });
    expect(book.read("alice", "other")).toBeNull();
  });

  it("never shows one account's drafts to another (class 103)", () => {
    const { storage } = memoryStorage();
    const book = createDraftBook({ now: () => 0, storage });
    book.write("alice", "now.line", { base: "", text: "Alice's words" });
    expect(book.read("bob", "now.line")).toBeNull();
    // Bob's first draft replaces the book: Alice's words are gone, not kept under his name.
    book.write("bob", "now.line", { base: "", text: "Bob's" });
    expect(book.read("alice", "now.line")).toBeNull();
    expect(book.read("bob", "now.line")).toEqual({ base: "", text: "Bob's" });
  });

  it("drops a draft older than 30 days", () => {
    const { storage } = memoryStorage();
    const clock = { at: 0 };
    const book = createDraftBook({ now: () => clock.at, storage });
    book.write("alice", "old", { base: "", text: "old" });
    clock.at = 10 * DAY;
    book.write("alice", "new", { base: "", text: "new" });
    clock.at = DRAFT_MAX_AGE_MS + 1;
    expect(book.read("alice", "old")).toBeNull();
    expect(book.read("alice", "new")).toEqual({ base: "", text: "new" });
  });

  it("removes one draft and forgets them all", () => {
    const { kept, storage } = memoryStorage();
    const book = createDraftBook({ now: () => 0, storage });
    book.write("alice", "a", { base: "", text: "a" });
    book.write("alice", "b", { base: "", text: "b" });
    book.remove("alice", "a");
    expect(book.read("alice", "a")).toBeNull();
    expect(book.read("alice", "b")).not.toBeNull();
    book.forget();
    expect(kept.value).toBeNull();
  });

  it("reads a broken or foreign record as no drafts, and a throwing store as none", () => {
    for (const stored of ["{", "[]", '{"owner":1}', '{"owner":"alice","entries":{"a":5}}']) {
      const book = createDraftBook({ now: () => 0, storage: memoryStorage(stored).storage });
      expect(book.read("alice", "a")).toBeNull();
    }
    const throwing: DraftStorage = {
      clear: () => {
        throw new Error("blocked");
      },
      read: () => {
        throw new Error("blocked");
      },
      write: () => {
        throw new Error("blocked");
      },
    };
    const book = createDraftBook({ now: () => 0, storage: throwing });
    expect(() => {
      book.write("alice", "a", { base: "", text: "a" });
      book.forget();
    }).not.toThrow();
    expect(book.read("alice", "a")).toBeNull();
  });

  it("keeps the newest drafts when there are too many", () => {
    const { storage } = memoryStorage();
    const clock = { at: 0 };
    const book = createDraftBook({ now: () => clock.at, storage });
    for (let index = 0; index < 60; index += 1) {
      clock.at = index;
      book.write("alice", `k${String(index)}`, { base: "", text: "x" });
    }
    expect(book.read("alice", "k0")).toBeNull();
    expect(book.read("alice", "k59")).not.toBeNull();
  });

  it("tags an account by a digest of its session, never the session itself", () => {
    expect(ownerTag(undefined)).toBeNull();
    expect(ownerTag("")).toBeNull();
    const tag = ownerTag("secret-session-token");
    expect(tag).not.toBeNull();
    expect(tag).not.toContain("secret");
    expect(ownerTag("secret-session-token")).toBe(tag);
    expect(ownerTag("another-token")).not.toBe(tag);
  });
});
