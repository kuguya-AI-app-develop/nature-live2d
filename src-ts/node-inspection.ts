import { inspectLive2DModelResources } from "./inspection.js";
import type { BuildProfileOptions } from "./profile.js";
import { readNodeJsonResource, scanLive2DResources } from "./node-resources.js";
import type { Live2DModelInspectionReport } from "./types.js";

export async function inspectLive2DModelDirectory(
  rootDir: string,
  options: Omit<BuildProfileOptions, "jsonLoader"> = {},
): Promise<Live2DModelInspectionReport> {
  const resources = await scanLive2DResources(rootDir);
  return inspectLive2DModelResources(resources, {
    ...options,
    jsonLoader: (href) => readNodeJsonResource(href),
  });
}
