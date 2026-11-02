/* eslint-disable functional/immutable-data -- the one place the materialized maps are written in place: only maps this batch made itself, never one a caller can hold, and frozen before the batch answers */
/**
Batch-local ("transient") updates of the materialized maps, so a full rebuild costs time linear in
the log (bug-lessons class 55). A reducer writes an entry with `assoc`, which outside a batch copies
the map as `{ ...map, [key]: value }` always did. Inside `inBatch` (one `materialize` pass) the
first write copies the map once, and every later write of the pass sets the entry in that copy:
the states between two events of one fold are never seen by anyone but the next reducer call, so
nothing can tell the difference. When the batch ends its maps are frozen; a later write (an event
integrated on top) copies again, so a caller never holds a map that still changes.

A reducer that keeps the states it folds through (a history of them) would see them change: no
reducer passed to `materialize` does, and one that needs to must fold by hand, outside a batch.
*/

/** Keys of a map whose entry is a member: kept up to date by `assoc` during a batch. */
export type KeyIndex<V> = { readonly isMember: (value: V) => boolean };

/** One index kept for a map: its keys, and its test with the entry type erased. */
type Kept = { readonly keys: Set<string>; readonly isMember: (value: unknown) => boolean };

type Batch = {
  /** Maps made in this batch: written in place, frozen when it ends. */
  readonly owned: WeakSet<object>;
  readonly made: object[];
  /** For an owned map, the keys each index holds, kept up to date by `assoc`. */
  readonly indexes: WeakMap<object, Map<object, Kept>>;
};

/** The batch running now, if any (materializing is synchronous, so there is one at a time). */
const scope: { current: Batch | null } = { current: null };

export const keyIndex = <V>(isMember: (value: V) => boolean): KeyIndex<V> => ({ isMember });

const newBatch = (): Batch => ({ indexes: new WeakMap(), made: [], owned: new WeakSet() });

const freezeMade = (batch: Batch | null): void => {
  const made = batch?.made ?? [];
  for (const map of made) {
    Object.freeze(map);
  }
};

/**
Runs `work` as one batch: `assoc` writes the maps it made in place; they are frozen at the end.
A batch inside another may answer maps the outer one made (a state it was given and left as it
was), so starting it freezes them, and the outer one goes on as a new batch that owns none of
them: every map a batch has handed out is frozen, nested or not.
*/
export const inBatch = <T>(work: () => T): T => {
  const isNested = scope.current !== null;
  freezeMade(scope.current);
  scope.current = newBatch();
  try {
    return work();
  } finally {
    freezeMade(scope.current);
    scope.current = isNested ? newBatch() : null;
  }
};

type Entries<V> = Readonly<Record<string, V>>;

/** The indexes kept for `map` in `batch` (made on first ask). */
const indexesOf = (batch: Batch, map: object): Map<object, Kept> => {
  const known = batch.indexes.get(map);
  if (known !== undefined) {
    return known;
  }
  const made = new Map<object, Kept>();
  batch.indexes.set(map, made);
  return made;
};

/** `map` with `key` set to `value`: a copy outside a batch or for a map the batch did not make. */
export const assoc = <V>(map: Entries<V>, key: string, value: V): Entries<V> => {
  const batch = scope.current;
  if (batch === null) {
    return { ...map, [key]: value };
  }
  if (!batch.owned.has(map)) {
    const copy = { ...map, [key]: value };
    batch.owned.add(copy);
    batch.made.push(copy);
    return copy;
  }
  // An own data property even for `__proto__` (assignment would set the prototype instead).
  Object.defineProperty(map, key, { configurable: true, enumerable: true, value, writable: true });
  const indexes = batch.indexes.get(map)?.values() ?? [];
  for (const { isMember, keys } of indexes) {
    if (isMember(value)) {
      keys.add(key);
    } else {
      keys.delete(key);
    }
  }
  return map;
};

/** One entity put into a `byId` state (tasks, projects, presets, series). */
export const putById = <V extends { readonly id: string }>(
  state: { readonly byId: Entries<V> },
  value: V,
): { readonly byId: Entries<V> } => ({ byId: assoc(state.byId, value.id, value) });

/** The running batch when it made `map`, else `null`. */
const ownerOf = (map: object): Batch | null => {
  const batch = scope.current;
  return batch?.owned.has(map) === true ? batch : null;
};

const scan = <V>(map: Entries<V>, index: KeyIndex<V>): readonly string[] =>
  Object.keys(map).filter((key) => index.isMember(map[key] as V));

/**
The keys whose entry `index` holds. Inside a batch, for a map it made, the index is built once
and then kept by `assoc`, so asking costs what it answers rather than the whole map.
*/
export const keysWhere = <V>(map: Entries<V>, index: KeyIndex<V>): readonly string[] => {
  const batch = ownerOf(map);
  if (batch === null) {
    return scan(map, index);
  }
  const indexes = indexesOf(batch, map);
  const kept = indexes.get(index) ?? {
    isMember: (value: unknown) => index.isMember(value as V),
    keys: new Set(scan(map, index)),
  };
  indexes.set(index, kept);
  return [...kept.keys];
};
/* eslint-enable functional/immutable-data -- the in-place writes end here */
