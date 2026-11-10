/** Identities occupy exactly one path segment, including dots and slashes. */
const segment = (value: string): string => encodeURIComponent(value).replaceAll(".", "%2E");

/** Every archive object of one owner (a user's store, whatever its generation) is under this. */
export const archiveOwnerPrefix = (owner: string): string => `history/v1/${segment(owner)}/`;

/** The objects of one generation of the owner's store. */
export const archiveStorePrefix = (owner: string, storeId: string): string =>
  `${archiveOwnerPrefix(owner)}${segment(storeId)}/`;
