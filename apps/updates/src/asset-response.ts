import { contentTypeForExtension } from "./shared/export-metadata.ts";

export const serveAsset = async (path: string, bucket: R2Bucket): Promise<Response> => {
  const match = /^\/assets\/([\w-]{43})\/([a-f0-9]{32})\.([a-z0-9]+)$/.exec(path);
  const extension = match?.[3];
  const contentType =
    extension === "bundle" ? "application/javascript" : contentTypeForExtension(extension ?? "");
  if (match === null || contentType === null) {
    return new Response(null, { status: 404 });
  }
  try {
    const object = await bucket.get(path.slice(1));
    if (object === null) {
      return new Response(null, { status: 404 });
    }
    return new Response(object.body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(object.size),
        etag: object.httpEtag,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
};
