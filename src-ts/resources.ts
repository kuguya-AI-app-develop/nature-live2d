import type { JsonObject, Live2DResourceSet, Live2DResourceUrls } from "./types.js";

export function createResourceSetFromUrls(options: Live2DResourceUrls): Live2DResourceSet {
  const root = ensureTrailingSlash(options.rootUrl);
  const resolve = (path?: string): string | null => (path ? joinResourceUrl(root, path) : null);
  return {
    root,
    source: "url",
    model3: resolve(options.model3Path),
    cdi3: resolve(options.cdi3Path),
    physics3: resolve(options.physics3Path),
    vtube: resolve(options.vtubePath),
    exp3: (options.exp3Paths ?? []).map((path) => joinResourceUrl(root, path)),
    ignored: (options.ignoredPaths ?? []).map((path) => joinResourceUrl(root, path)),
  };
}

export async function readJsonResource(
  resourceSet: Live2DResourceSet,
  href: string,
  fetcher: typeof fetch = fetch,
): Promise<JsonObject> {
  if (resourceSet.source !== "url") {
    throw new Error("File resources require the @kuguya-ai/nature-live2d/node entrypoint");
  }

  const response = await fetcher(href);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${href}: HTTP ${response.status}`);
  }
  return (await response.json()) as JsonObject;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function joinResourceUrl(root: string, path: string): string {
  if (/^https?:\/\//.test(root)) return new URL(path, root).toString();
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `${root}${path}`;
}
