/** Narrows an optional query/form value to a non-empty string. */
export const isPresent = (value: null | string | undefined): value is string =>
  value !== null && value !== undefined && value.length > 0;
