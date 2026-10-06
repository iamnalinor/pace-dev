/** Public surface of @pace/core. Everything here is pure: no I/O, no platform APIs. */
export {
  type ApiProblem,
  buildPath,
  endpoint,
  type EndpointInput,
  type EndpointOutput,
  type EndpointShape,
  type HttpMethod,
} from "./api/endpoint.ts";
export { endpoints } from "./api/endpoints.ts";
export { err, ok, type Result } from "./result.ts";
