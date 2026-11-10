import { useState } from "react";

import { newId } from "@pace/core";

type Rows = { readonly keys: readonly string[]; readonly list: readonly unknown[] };

/** A row the person removed, and the list it was removed from. */
type Removal = { readonly index: number; readonly list: readonly unknown[] };

/** The keys after `list` replaced `rows.list`: the removed row's key goes, new rows get new keys. */
const keysAfter = (rows: Rows, list: readonly unknown[], removal: null | Removal): string[] => {
  const kept =
    removal !== null && removal.list === rows.list && list.length === rows.keys.length - 1
      ? rows.keys.filter((_, position) => position !== removal.index)
      : rows.keys.slice(0, list.length);
  return [...kept, ...Array.from({ length: list.length - kept.length }, () => newId())];
};

/**
Keys for the rows of a stored list of plain values that the person edits by position (the digest
times): a row keeps its key, and with it its field and what is typed there, when a row above it is
removed, and a removed row's field goes with its own row, not with the last one (review of the QA
27 wave, I1; keyed by index, the last field unmounted with the text typed in another row). Call
`removing(index)` with the press that removes a row; a list changed elsewhere (synced) keeps keys by
position.
*/
export const useRowKeys = (
  list: readonly unknown[],
): { readonly keys: readonly string[]; readonly removing: (index: number) => void } => {
  const [rows, setRows] = useState<Rows>(() => ({ keys: list.map(() => newId()), list }));
  const [removal, setRemoval] = useState<null | Removal>(null);
  if (rows.list !== list) {
    setRows({ keys: keysAfter(rows, list, removal), list });
    setRemoval(null);
  }
  return {
    keys: rows.keys,
    removing: (index) => {
      setRemoval({ index, list: rows.list });
    },
  };
};
