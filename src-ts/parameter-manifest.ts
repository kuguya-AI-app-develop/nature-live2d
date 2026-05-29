import type {
  CharacterProfile,
  Live2DParameterManifest,
  Live2DParameterManifestEntry,
  Live2DParameterSafety,
  ParameterProfile,
} from "./types.js";

export function buildParameterManifest(profile: CharacterProfile): Live2DParameterManifest {
  const entries: Record<string, Live2DParameterManifestEntry> = {};
  const byRole: Record<string, string[]> = {};
  const safeParameterIds: string[] = [];
  const guardedParameterIds: string[] = [];
  const blockedParameterIds: string[] = [];
  const expressionUsage = expressionPresetUsage(profile.expressionPresets);

  for (const parameter of Object.values(profile.parameters).sort((a, b) => a.id.localeCompare(b.id))) {
    const safety = parameterSafety(parameter);
    const entry: Live2DParameterManifestEntry = {
      id: parameter.id,
      role: parameter.role,
      safety,
      controllable: parameter.controllable,
      downstream: parameter.downstream,
      range: parameter.range ?? null,
      meta: parameter.meta ?? null,
      sources: parameter.sources ?? [],
      expressionPresets: expressionUsage[parameter.id] ?? [],
      reason: parameterSafetyReason(parameter, safety),
    };
    entries[parameter.id] = entry;
    byRole[parameter.role] ??= [];
    byRole[parameter.role].push(parameter.id);
    if (safety === "safe") safeParameterIds.push(parameter.id);
    else if (safety === "guarded") guardedParameterIds.push(parameter.id);
    else if (safety === "blocked") blockedParameterIds.push(parameter.id);
  }

  for (const ids of Object.values(byRole)) ids.sort();

  return {
    characterId: profile.characterId,
    characterName: profile.characterName,
    totalCount: Object.keys(entries).length,
    controllableCount: safeParameterIds.length,
    safeParameterIds,
    guardedParameterIds,
    blockedParameterIds,
    byRole,
    entries,
    expressionPresetNames: Object.keys(profile.expressionPresets).sort(),
  };
}

export function summarizeParameterManifest(manifest: Live2DParameterManifest): string {
  const roleSummary = Object.entries(manifest.byRole)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([role, ids]) => `${role}:${ids.length}`)
    .join(", ");
  return [
    `${manifest.characterName} parameters`,
    `total=${manifest.totalCount}`,
    `safe=${manifest.safeParameterIds.length}`,
    `guarded=${manifest.guardedParameterIds.length}`,
    `blocked=${manifest.blockedParameterIds.length}`,
    roleSummary,
  ].filter(Boolean).join(" · ");
}

function expressionPresetUsage(expressionPresets: Record<string, Record<string, number>>): Record<string, string[]> {
  const usage: Record<string, string[]> = {};
  for (const [name, preset] of Object.entries(expressionPresets)) {
    for (const id of Object.keys(preset)) {
      usage[id] ??= [];
      usage[id].push(name);
    }
  }
  for (const names of Object.values(usage)) names.sort();
  return usage;
}

function parameterSafety(parameter: ParameterProfile): Live2DParameterSafety {
  if (parameter.controllable) return "safe";
  if (parameter.downstream || parameter.role === "physics_downstream") return "blocked";
  if (parameter.role === "unknown") return "unknown";
  return "guarded";
}

function parameterSafetyReason(parameter: ParameterProfile, safety: Live2DParameterSafety): string {
  if (safety === "safe") return "safe controllable parameter selected from model sources";
  if (safety === "blocked") return "blocked because it is physics-driven or downstream-only";
  if (safety === "guarded") return "known model parameter but not selected for default control";
  return "unclassified parameter; require explicit user mapping before control";
}
