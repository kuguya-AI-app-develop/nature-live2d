import { buildMotionCapability } from "./motion-capability.js";
import { buildParameterManifest } from "./parameter-manifest.js";
import { buildCharacterProfile, type BuildProfileOptions } from "./profile.js";
import { createResourceSetFromModel3Url, createResourceSetFromUrls } from "./resources.js";
import type {
  CharacterProfile,
  Live2DModel3Urls,
  Live2DModelInspectionIssue,
  Live2DModelInspectionReport,
  Live2DModelMotionStrategy,
  Live2DResourceSet,
  Live2DResourceUrls,
} from "./types.js";

export async function inspectLive2DModelResources(
  resources: Live2DResourceSet,
  options: BuildProfileOptions = {},
): Promise<Live2DModelInspectionReport> {
  return createInspectionReport(await buildCharacterProfile(resources, options));
}

export async function inspectLive2DModelUrls(
  urls: Live2DResourceUrls,
  options: BuildProfileOptions = {},
): Promise<Live2DModelInspectionReport> {
  return inspectLive2DModelResources(createResourceSetFromUrls(urls), options);
}

export async function inspectLive2DModelFromModel3Url(
  urls: Live2DModel3Urls,
  options: BuildProfileOptions = {},
): Promise<Live2DModelInspectionReport> {
  const fetcher = options.fetcher ?? fetch;
  const resources = await createResourceSetFromModel3Url(urls, fetcher);
  return inspectLive2DModelResources(resources, options);
}

export function createInspectionReport(profile: CharacterProfile): Live2DModelInspectionReport {
  const manifest = buildParameterManifest(profile);
  const capability = buildMotionCapability(manifest);
  const issues = collectIssues(profile, capability);
  const strategy = resolveStrategy(
    capability.missingCoreFeatures.length,
    capability.score,
    capability.safeParameterIds.length,
  );

  return {
    characterId: profile.characterId,
    characterName: profile.characterName,
    resources: profile.resources,
    profile,
    manifest,
    capability,
    strategy,
    defaultMotionUsable: strategy !== "manual_mapping_required",
    issues,
    recommendations: collectRecommendations(strategy, issues),
  };
}

function collectIssues(
  profile: CharacterProfile,
  capability: ReturnType<typeof buildMotionCapability>,
): Live2DModelInspectionIssue[] {
  const issues: Live2DModelInspectionIssue[] = [];

  if (!profile.resources.model3) {
    issues.push({
      code: "missing_model3",
      severity: "warning",
      message: "No .model3.json resource was declared or discovered.",
    });
  }
  if (!profile.resources.vtube) {
    issues.push({
      code: "missing_vtube_profile",
      severity: "info",
      message: "No .vtube.json profile was found; ranges are derived from CDI, physics, expression presets, and common Live2D names.",
    });
  }
  if (!profile.resources.cdi3) {
    issues.push({
      code: "missing_cdi_metadata",
      severity: "info",
      message: "No .cdi3.json display metadata was found; role detection falls back to parameter naming.",
    });
  }
  if (!profile.resources.exp3.length) {
    issues.push({
      code: "missing_expression_presets",
      severity: "info",
      message: "No .exp3.json expression presets were found; expression-layer controls will need explicit mapping.",
    });
  }
  if (!capability.safeParameterIds.length) {
    issues.push({
      code: "no_safe_parameters",
      severity: "warning",
      message: "No safe controllable parameters were discovered; default motion cannot drive this model.",
    });
  }
  if (capability.missingCoreFeatures.length) {
    issues.push({
      code: "missing_core_motion_features",
      severity: capability.score < 0.35 ? "warning" : "info",
      message: `Missing core motion features: ${capability.missingCoreFeatures.join(", ")}.`,
    });
  }
  if (!capability.availableFeatures.includes("expressionLayer")) {
    issues.push({
      code: "missing_expression_layer",
      severity: "info",
      message: "No safe expression-layer parameters were discovered; emotion output will rely on continuous parameters.",
    });
  }

  return issues;
}

function resolveStrategy(
  missingCoreCount: number,
  capabilityScore: number,
  safeParameterCount: number,
): Live2DModelMotionStrategy {
  if (safeParameterCount === 0) return "manual_mapping_required";
  if (capabilityScore >= 0.75 && missingCoreCount <= 1) return "full";
  if (capabilityScore >= 0.22) return "basic";
  return "manual_mapping_required";
}

function collectRecommendations(
  strategy: Live2DModelMotionStrategy,
  issues: Live2DModelInspectionIssue[],
): string[] {
  const recommendations: string[] = [];
  if (strategy === "full") {
    recommendations.push("Default realtime and natural motion can be enabled directly.");
  } else if (strategy === "basic") {
    recommendations.push("Default motion can run, but tune intensity lower and inspect missing core features before release.");
  } else {
    recommendations.push("Provide an explicit host-app parameter mapping before enabling default motion.");
  }

  if (issues.some((issue) => issue.code === "missing_vtube_profile")) {
    recommendations.push("Provide a VTube Studio .vtube.json profile when available to improve output ranges and controllable parameter selection.");
  }
  if (issues.some((issue) => issue.code === "missing_expression_presets")) {
    recommendations.push("Declare .exp3.json presets or map expression-layer parameters manually for richer emotional states.");
  }
  if (issues.some((issue) => issue.code === "missing_core_motion_features")) {
    recommendations.push("Review the capability report and decide whether missing features should be mapped to model-specific parameters.");
  }

  return recommendations;
}
