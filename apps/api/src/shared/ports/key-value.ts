/** Paginated text/JSON store used for OAuth grant metadata. */
export type KeyValue = {
  readonly get: {
    (key: string): Promise<null | string>;
    (key: string, format: "json"): Promise<unknown>;
  };
  readonly put: (key: string, value: string) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly list: (options: {
    readonly prefix: string;
    readonly cursor?: string;
    readonly limit?: number;
  }) => Promise<{
    readonly keys: readonly { readonly name: string }[];
    readonly list_complete: boolean;
    readonly cursor?: string;
  }>;
};
