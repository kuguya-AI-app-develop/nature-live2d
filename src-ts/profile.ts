import {
  YACHIYO_FALLBACK_RANGES,
  YACHIYO_MAIN_CONTROLS,
  YACHIYO_RANGE_OVERRIDES,
  YACHIYO_UNSAFE_PATTERNS,
} from "./defaults.js";
import {
  parseCdiParameters,
  parseExpression,
  parseExpressionName,
  parsePhysicsDownstreamParameters,
  parsePhysicsInputParameters,
  parseVTubeParameters,
  rangeFromBounds,
} from "./parsers.js";
import { readJsonResource } from "./resources.js";
import type {
  CharacterProfile,
  JsonObject,
  Live2DResourceSet,
  ParameterMeta,
  ParameterProfile,
  ParameterRange,
} from "./types.js";

export interface BuildProfileOptions {
  fetcher?: typeof fetch;
  jsonLoader?: (href: string, resources: Live2DResourceSet) => Promise<JsonObject>;
}

export async function buildCharacterProfile(
  resources: Live2DResourceSet,
  options: BuildProfileOptions = {},
): Promise<CharacterProfile> {
  const fetcher = options.fetcher ?? fetch;
  const loadJson =
    options.jsonLoader ?? ((href: string, currentResources: Live2DResourceSet) =>
      readJsonResource(currentResources, href, fetcher));
  const ranges: Record<string, ParameterRange> = {};
  const metas: Record<string, ParameterMeta> = {};
  let physicsInputs = new Set<string>();
  let physicsDownstream = new Set<string>();
  const expressionPresets: Record<string, Record<string, number>> = {};

  let vtubeData: JsonObject | null = null;
  if (resources.vtube) {
    vtubeData = await loadJson(resources.vtube, resources);
    Object.assign(ranges, parseVTubeParameters(vtubeData));
  }

  for (const [id, [lower, upper]] of Object.entries(YACHIYO_FALLBACK_RANGES)) {
    ranges[id] ??= rangeFromBounds(id, lower, upper, "manual");
  }
  for (const [id, [lower, upper]] of Object.entries(YACHIYO_RANGE_OVERRIDES)) {
    ranges[id] = rangeFromBounds(id, lower, upper, "manual_override");
  }

  if (resources.cdi3) {
    Object.assign(metas, parseCdiParameters(await loadJson(resources.cdi3, resources)));
  }

  if (resources.physics3) {
    const physicsData = await loadJson(resources.physics3, resources);
    physicsInputs = parsePhysicsInputParameters(physicsData);
    physicsDownstream = parsePhysicsDownstreamParameters(physicsData);
  }

  for (const exp3 of resources.exp3) {
    expressionPresets[parseExpressionName(exp3)] = parseExpression(
      await loadJson(exp3, resources),
    );
  }

  const parameterIds = new Set<string>(YACHIYO_MAIN_CONTROLS);
  for (const id of Object.keys(ranges)) parameterIds.add(id);
  for (const id of Object.keys(metas)) parameterIds.add(id);
  for (const id of physicsInputs) parameterIds.add(id);
  for (const id of physicsDownstream) parameterIds.add(id);
  for (const preset of Object.values(expressionPresets)) {
    for (const id of Object.keys(preset)) parameterIds.add(id);
  }

  const mainControls = [...YACHIYO_MAIN_CONTROLS];
  const mainControlSet = new Set<string>(mainControls);
  const parameters: Record<string, ParameterProfile> = {};
  for (const id of [...parameterIds].sort()) {
    const downstream = physicsDownstream.has(id) && !mainControlSet.has(id);
    parameters[id] = {
      id,
      range: ranges[id] ?? null,
      meta: metas[id] ?? null,
      role: inferRole(id, metas[id]?.category ?? null, downstream),
      controllable: mainControlSet.has(id),
      downstream,
    };
  }

  return {
    characterId: lastPathSegment(resources.root) || "live2d-model",
    characterName: typeof vtubeData?.Name === "string" ? vtubeData.Name : lastPathSegment(resources.root),
    resources,
    parameters,
    mainControls,
    expressionPresets,
    unsafePatterns: [...YACHIYO_UNSAFE_PATTERNS],
  };
}

function inferRole(id: string, category: string | null, downstream: boolean): string {
  if (downstream) return "physics_downstream";
  if (id.startsWith("ParamExpression_")) return "special_expression";
  if (id.startsWith("ParamHide_") || id.includes("Hide_")) return "visibility";
  if (id === "ParamBreath") return "breath";
  if (id.startsWith("ParamBodyAngle")) return "body";
  if (id.startsWith("ParamAngle")) return "head";
  if (id.startsWith("ParamEye")) return "eye";
  if (id.startsWith("ParamBrow")) return "brow";
  if (id.startsWith("ParamMouth") || id.startsWith("ParamJaw") || id.startsWith("ParamTongue")) {
    return "mouth";
  }
  if (id.startsWith("ParamCheek")) return "cheek";
  const lowered = category?.toLowerCase() ?? "";
  if (lowered.includes("eye")) return "eye";
  if (lowered.includes("mouth")) return "mouth";
  if (lowered.includes("brow")) return "brow";
  if (lowered.includes("expression")) return "special_expression";
  return "unknown";
}

function lastPathSegment(value: string): string {
  const clean = value.replace(/[\\/]$/, "");
  return decodeURIComponent(clean.split(/[\\/]/).pop() ?? clean);
}
