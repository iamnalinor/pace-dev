/** An HTTP error from the API, with the machine-readable `code` when the server sent one. */
export class ApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(status: number, body: unknown) {
    const { code, message } = describe(body);
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const describe = (body: unknown): { code: string | undefined; message: string } => {
  if (typeof body === "object" && body !== null && "message" in body) {
    const code = "code" in body && typeof body.code === "string" ? body.code : undefined;
    const message = typeof body.message === "string" ? body.message : "Request failed";
    return { code, message };
  }
  return { code: undefined, message: "Request failed" };
};

type EdenResult<TData> =
  | { data: null; error: { status: unknown; value: unknown } }
  | { data: TData; error: null };

/**
 * Eden returns `{ data, error }`; TanStack Query expects a value or a thrown error.
 * This is the single bridge between the two.
 */
export const unwrap = async <TData>(request: Promise<EdenResult<TData>>): Promise<TData> => {
  const { data, error } = await request;
  if (error !== null) {
    throw new ApiError(typeof error.status === "number" ? error.status : 0, error.value);
  }
  return data;
};
