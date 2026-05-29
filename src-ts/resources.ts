import { asArray, asObject, asString } from "./parsers.js";
import type { JsonObject, Live2DResourceSet, Live2DResourceUrls } from "./types.js";
import type { Live2DModel3Urls } from "./types.js";

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

export async function createResourceSetFromModel3Url(
  options: Live2DModel3Urls,
  fetcher: typeof fetch = fetch,
): Promise<Live2DResourceSet> {
  const baseResources = createResourceSetFromUrls(options);
  if (!baseResources.model3) {
    throw new Error("model3Path is required to import a Live2D model");
  }

  const model3 = await readJsonResource(baseResources, baseResources.model3, fetcher);
  const references = asObject(model3.FileReferences) ?? {};
  const expressionPaths = asArray<JsonObject>(references.Expressions)
    .map((item) => asString(item.File))
    .filter((path): path is string => Boolean(path));

  return createResourceSetFromUrls({
    ...options,
    cdi3Path: options.cdi3Path ?? asString(references.DisplayInfo) ?? undefined,
    physics3Path: options.physics3Path ?? asString(references.Physics) ?? undefined,
    exp3Paths: unique([...(options.exp3Paths ?? []), ...expressionPaths]),
  });
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
