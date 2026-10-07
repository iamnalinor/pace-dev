/** The item at `index`, or a failed test that says which one was missing. */
export const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an item at ${String(index)} of ${String(items.length)}`);
  }
  return item;
};
