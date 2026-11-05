import type { RequestPlace, RequestPlaceReader } from "./ports/request-place.ts";

export type { RequestPlace } from "./ports/request-place.ts";

/** A request nothing is known about: an agent's token made in Settings, a test without headers. */
export const UNKNOWN_PLACE: RequestPlace = { city: null, country: null, ip: null, userAgent: null };

/** Read provenance through the host adapter chosen by application composition. */
export const requestPlace = (request: Request, reader: RequestPlaceReader): RequestPlace =>
  reader.read(request);

/** Direct app users without a host adapter have no trusted request provenance. */
export const unknownRequestPlaceReader: RequestPlaceReader = { read: () => UNKNOWN_PLACE };
