import {
  COMMON_LIVE2D_CONTROL_RANGES,
  YACHIYO_FALLBACK_RANGES,
  YACHIYO_RANGE_OVERRIDES,
  YACHIYO_UNSAFE_PATTERNS,
} from "./defaults.js";
import {
  parseCdiParameters,
  parseExpression,
  parseExpressionName,
  parsePhysicsDownstreamParameters,
  parsePhysicsInputParameters,
  parseVTubeMappings,
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
  const vtubeControlIds = new Set<string>();

  let vtubeData: JsonObject | null = null;
  if (resources.vtube) {
    vtubeData = await loadJson(resources.vtube, resources);
    Object.assign(ranges, parseVTubeParameters(vtubeData));
    for (const id of Object.keys(parseVTubeMappings(vtubeData))) vtubeControlIds.add(id);
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

  const expressionIds = expressionParameterIds(expressionPresets);
  for (const [id, [lower, upper]] of Object.entries(YACHIYO_FALLBACK_RANGES)) {
    if (expressionIds.has(id)) ranges[id] ??= rangeFromBounds(id, lower, upper, "manual");
  }
  for (const [id, [lower, upper]] of Object.entries(YACHIYO_RANGE_OVERRIDES)) {
    if (ranges[id] || metas[id] || expressionIds.has(id)) {
      ranges[id] = rangeFromBounds(id, lower, upper, "manual_override");
    }
  }

  for (const preset of Object.values(expressionPresets)) {
    for (const [id, value] of Object.entries(preset)) {
      if (!ranges[id] && isExpressionLikeParameter(id, value)) {
        ranges[id] = rangeFromBounds(id, 0, 1, "expression_fallback");
      }
    }
  }

  const parameterIds = new Set<string>();
  for (const id of Object.keys(ranges)) parameterIds.add(id);
  for (const id of Object.keys(metas)) parameterIds.add(id);
  for (const id of physicsInputs) parameterIds.add(id);
  for (const id of physicsDownstream) parameterIds.add(id);
  for (const preset of Object.values(expressionPresets)) {
    for (const id of Object.keys(preset)) parameterIds.add(id);
  }

  for (const id of parameterIds) {
    if (!ranges[id] && COMMON_LIVE2D_CONTROL_RANGES[id]) {
      ranges[id] = rangeFromBounds(id, COMMON_LIVE2D_CONTROL_RANGES[id][0], COMMON_LIVE2D_CONTROL_RANGES[id][1], "common_fallback");
    }
  }

  const mainControls = deriveMainControls({
    parameterIds,
    ranges,
    metas,
    vtubeControlIds,
    expressionPresets,
    physicsDownstream,
  });
  const mainControlSet = new Set<string>(mainControls);
  const parameters: Record<string, ParameterProfile> = {};
  for (const id of [...parameterIds].sort()) {
    const downstream = physicsDownstream.has(id) && !mainControlSet.has(id);
    const role = inferRole(id, metas[id]?.category ?? null, downstream);
    parameters[id] = {
      id,
      range: ranges[id] ?? null,
      meta: metas[id] ?? null,
      role,
      controllable: mainControlSet.has(id),
      downstream,
      sources: parameterSources(id, {
        ranges,
        metas,
        vtubeControlIds,
        physicsInputs,
        physicsDownstream,
        expressionPresets,
      }),
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

function deriveMainControls(input: {
  parameterIds: Set<string>;
  ranges: Record<string, ParameterRange>;
  metas: Record<string, ParameterMeta>;
  vtubeControlIds: Set<string>;
  expressionPresets: Record<string, Record<string, number>>;
  physicsDownstream: Set<string>;
}): string[] {
  const controls = new Set<string>();
  const expressionIds = expressionParameterIds(input.expressionPresets);
  const preferredIds = input.vtubeControlIds.size
    ? input.vtubeControlIds
    : new Set([...input.parameterIds].filter((id) => COMMON_LIVE2D_CONTROL_RANGES[id]));

  for (const id of preferredIds) {
    const role = inferRole(id, input.metas[id]?.category ?? null, false);
    if (isSafeControllableParameter(id, role, input.physicsDownstream)) controls.add(id);
  }
  for (const id of expressionIds) {
    const role = inferRole(id, input.metas[id]?.category ?? null, false);
    if (isSafeControllableParameter(id, role, input.physicsDownstream)) controls.add(id);
  }
  for (const id of Object.keys(input.ranges)) {
    const role = inferRole(id, input.metas[id]?.category ?? null, false);
    if (expressionIds.has(id) || input.vtubeControlIds.has(id)) continue;
    if (isSafeControllableParameter(id, role, input.physicsDownstream) && COMMON_LIVE2D_CONTROL_RANGES[id]) {
      controls.add(id);
    }
  }
  return [...controls].sort();
}

function isSafeControllableParameter(id: string, role: string, physicsDownstream: Set<string>): boolean {
  if (physicsDownstream.has(id)) return false;
  if (id.startsWith("ParamSwitchCtrl")) return false;
  if (id === "ParamBreathPhysics_L") return true;
  if (YACHIYO_UNSAFE_PATTERNS.some((pattern) => id.includes(pattern))) return false;
  return SAFE_PARAMETER_ROLES.has(role);
}

const SAFE_PARAMETER_ROLES = new Set([
  "head",
  "body",
  "breath",
  "eye",
  "brow",
  "mouth",
  "cheek",
  "effect",
  "special_expression",
  "visibility",
]);

function isExpressionLikeParameter(id: string, value: number): boolean {
  return Number.isFinite(value)
    && value >= 0
    && value <= 1
    && (id.startsWith("ParamExpression_") || id.startsWith("ParamHide_") || id.includes("Hide_"));
}

function expressionParameterIds(expressionPresets: Record<string, Record<string, number>>): Set<string> {
  const ids = new Set<string>();
  for (const preset of Object.values(expressionPresets)) {
    for (const id of Object.keys(preset)) ids.add(id);
  }
  return ids;
}

function parameterSources(id: string, input: {
  ranges: Record<string, ParameterRange>;
  metas: Record<string, ParameterMeta>;
  vtubeControlIds: Set<string>;
  physicsInputs: Set<string>;
  physicsDownstream: Set<string>;
  expressionPresets: Record<string, Record<string, number>>;
}): string[] {
  const sources = new Set<string>();
  if (input.ranges[id]) sources.add(input.ranges[id].source);
  if (input.metas[id]) sources.add("cdi3");
  if (input.vtubeControlIds.has(id)) sources.add("vtube");
  if (input.physicsInputs.has(id)) sources.add("physics_input");
  if (input.physicsDownstream.has(id)) sources.add("physics_downstream");
  for (const [name, preset] of Object.entries(input.expressionPresets)) {
    if (preset[id] !== undefined) sources.add(`expression:${name}`);
  }
  return [...sources].sort();
}

function inferRole(id: string, category: string | null, downstream: boolean): string {
  if (downstream) return "physics_downstream";
  if (id.startsWith("ParamExpression_")) return "special_expression";
  if (id.startsWith("ParamHide_") || id.includes("Hide_")) return "visibility";
  if (id === "ParamBreath") return "breath";
  if (id === "ParamBreathPhysics_L") return "breath";
  if (id === "fire") return "effect";
  if (
    id.startsWith("ParamPupilQuake")
    || id.startsWith("ParamTear")
    || id.startsWith("ParamCryDown")
    || id.startsWith("ParamEyeOpenBlink")
    || id === "ParamEyeCircles"
  ) {
    return "effect";
  }
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
