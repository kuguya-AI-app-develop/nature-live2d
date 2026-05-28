import type { JsonObject, ParameterMeta, ParameterRange } from "./types.js";

export interface VTubeParameterMapping {
  inputName?: string | null;
  outputLive2D: string;
  inputRange?: [number, number] | null;
  outputRange: [number, number];
  smoothing?: number | null;
  useBreathing: boolean;
}

export function rangeFromBounds(
  id: string,
  lower: number,
  upper: number,
  source: string,
): ParameterRange {
  return {
    id,
    min: Math.min(lower, upper),
    max: Math.max(lower, upper),
    source,
    rawMin: lower,
    rawMax: upper,
  };
}

export function parseVTubeMappings(data: JsonObject): Record<string, VTubeParameterMapping> {
  const mappings: Record<string, VTubeParameterMapping> = {};
  for (const item of asArray<JsonObject>(data.ParameterSettings)) {
    const outputId = asString(item.OutputLive2D);
    if (!outputId) continue;

    const outputLower = asNumber(item.OutputRangeLower, 0);
    const outputUpper = asNumber(item.OutputRangeUpper, 0);
    const hasInputRange = item.InputRangeLower !== undefined && item.InputRangeUpper !== undefined;

    mappings[outputId] = {
      inputName: asString(item.Input),
      outputLive2D: outputId,
      inputRange: hasInputRange
        ? [asNumber(item.InputRangeLower, 0), asNumber(item.InputRangeUpper, 0)]
        : null,
      outputRange: [outputLower, outputUpper],
      smoothing: item.Smoothing === undefined ? null : asNumber(item.Smoothing, 0),
      useBreathing: Boolean(item.UseBreathing),
    };
  }
  return mappings;
}

export function parseVTubeParameters(data: JsonObject): Record<string, ParameterRange> {
  const ranges: Record<string, ParameterRange> = {};
  for (const [id, mapping] of Object.entries(parseVTubeMappings(data))) {
    ranges[id] = rangeFromBounds(id, mapping.outputRange[0], mapping.outputRange[1], "vtube");
  }
  return ranges;
}

export function parseVTubeHotkeys(data: JsonObject): Record<string, string> {
  const hotkeys: Record<string, string> = {};
  for (const item of asArray<JsonObject>(data.Hotkeys)) {
    if (item.Action !== "ToggleExpression") continue;
    const name = asString(item.Name);
    const file = asString(item.File);
    if (name && file) hotkeys[name] = file;
  }
  return hotkeys;
}

export function parseExpression(data: JsonObject): Record<string, number> {
  const params: Record<string, number> = {};
  for (const item of asArray<JsonObject>(data.Parameters)) {
    const id = asString(item.Id);
    if (!id || item.Value === undefined) continue;
    params[id] = asNumber(item.Value, 0);
  }
  return params;
}

export function parseExpressionName(pathOrUrl: string): string {
  const fileName = decodeURIComponent(pathOrUrl.split(/[\\/]/).pop() ?? pathOrUrl);
  return fileName.endsWith(".exp3.json") ? fileName.slice(0, -".exp3.json".length) : fileName;
}

export function parseCdiParameters(data: JsonObject): Record<string, ParameterMeta> {
  const groupNames: Record<string, string> = {};
  for (const item of asArray<JsonObject>(data.ParameterGroups)) {
    const id = asString(item.Id);
    const name = asString(item.Name);
    if (id) groupNames[id] = name ?? id;
  }

  const params: Record<string, ParameterMeta> = {};
  for (const item of asArray<JsonObject>(data.Parameters)) {
    const id = asString(item.Id);
    if (!id) continue;
    const groupId = asString(item.GroupId);
    params[id] = {
      id,
      name: asString(item.Name),
      group: groupId ? groupNames[groupId] ?? groupId : null,
      category: groupId,
    };
  }
  return params;
}

export function parsePhysicsDependencies(data: JsonObject): Record<string, Set<string>> {
  const dependencies: Record<string, Set<string>> = {};
  for (const setting of asArray<JsonObject>(data.PhysicsSettings)) {
    const outputs = destinationIds(setting);
    for (const sourceId of sourceIds(setting)) {
      dependencies[sourceId] ??= new Set<string>();
      for (const output of outputs) dependencies[sourceId].add(output);
    }
  }
  return dependencies;
}

export function parsePhysicsInputParameters(data: JsonObject): Set<string> {
  const inputs = new Set<string>();
  for (const setting of asArray<JsonObject>(data.PhysicsSettings)) {
    for (const id of sourceIds(setting)) inputs.add(id);
  }
  return inputs;
}

export function parsePhysicsDownstreamParameters(data: JsonObject): Set<string> {
  const downstream = new Set<string>();
  for (const setting of asArray<JsonObject>(data.PhysicsSettings)) {
    for (const id of destinationIds(setting)) downstream.add(id);
  }
  return downstream;
}

function sourceIds(setting: JsonObject): string[] {
  return asArray<JsonObject>(setting.Input)
    .map((item) => asObject(item.Source))
    .filter((source) => source?.Target === "Parameter")
    .map((source) => asString(source?.Id))
    .filter((id): id is string => Boolean(id));
}

function destinationIds(setting: JsonObject): string[] {
  return asArray<JsonObject>(setting.Output)
    .map((item) => asObject(item.Destination))
    .filter((destination) => destination?.Target === "Parameter")
    .map((destination) => asString(destination?.Id))
    .filter((id): id is string => Boolean(id));
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

