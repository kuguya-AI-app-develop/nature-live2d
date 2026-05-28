import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { JsonObject, Live2DResourceSet } from "./types.js";

export async function scanLive2DResources(rootDir: string): Promise<Live2DResourceSet> {
  const root = resolve(rootDir);
  const entries = await readdir(root);
  const resources: Live2DResourceSet = {
    root,
    source: "file",
    model3: null,
    cdi3: null,
    physics3: null,
    vtube: null,
    exp3: [],
    ignored: [],
  };

  for (const name of entries.sort()) {
    if (!name.endsWith(".json")) continue;
    const fullPath = join(root, name);
    if (name.endsWith(".model3.json")) resources.model3 ??= fullPath;
    else if (name.endsWith(".cdi3.json")) resources.cdi3 ??= fullPath;
    else if (name.endsWith(".physics3.json")) resources.physics3 ??= fullPath;
    else if (name.endsWith(".vtube.json")) resources.vtube ??= fullPath;
    else if (name.endsWith(".exp3.json")) resources.exp3.push(fullPath);
    else resources.ignored.push(fullPath);
  }

  return resources;
}

export async function readNodeJsonResource(href: string): Promise<JsonObject> {
  return JSON.parse(await readFile(href, "utf8")) as JsonObject;
}

