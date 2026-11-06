/** Where a request came from, as reported by the host and client: each part may be unknown. */
export type RequestPlace = {
  readonly ip: null | string;
  readonly country: null | string;
  readonly city: null | string;
  readonly userAgent: null | string;
};

/** The host reports provenance; portable consumers never interpret platform metadata. */
export type RequestPlaceReader = {
  readonly read: (request: Request) => RequestPlace;
};
