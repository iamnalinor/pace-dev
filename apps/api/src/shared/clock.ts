/** Time as a dependency: use cases never call `new Date()` directly, so tests control time. */
export type Clock = { readonly now: () => Date };

export const systemClock: Clock = { now: () => new Date() };
