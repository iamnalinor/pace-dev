export type OtaError =
  | "export-read-failed"
  | "invalid-artifacts"
  | "invalid-export-metadata"
  | "invalid-manifest"
  | "invalid-manifest-input"
  | "signing-failed"
  | "unsafe-export-path"
  | "unsupported-asset-type"
  | "unsupported-update-request";
export type ExportAsset = {
  readonly path: string;
  readonly ext: string;
  readonly contentType: string;
};
export type ExportPlan = { readonly bundle: string; readonly assets: readonly ExportAsset[] };
export type Artifact = {
  readonly path: string;
  readonly key: string;
  readonly hash: string;
  readonly size: number;
  readonly bytes?: Uint8Array;
};
export type ExportArtifacts = { readonly plan: ExportPlan; readonly files: readonly Artifact[] };

export type SignedManifest = {
  readonly body: Uint8Array;
  readonly signature: string;
  readonly signatureHeader: string;
};
