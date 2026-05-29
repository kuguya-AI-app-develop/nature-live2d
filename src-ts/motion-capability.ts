import { buildParameterManifest } from "./parameter-manifest.js";
import type {
  CharacterProfile,
  Live2DMotionCapability,
  Live2DMotionFeature,
  Live2DParameterManifest,
} from "./types.js";

const FEATURE_IDS: Record<Live2DMotionFeature, string[]> = {
  head: ["ParamAngleX", "ParamAngleY", "ParamAngleZ"],
  body: ["ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ"],
  breath: ["ParamBreath"],
  gaze: ["ParamEyeBallX", "ParamEyeBallY"],
  eyeOpen: ["ParamEyeLOpen", "ParamEyeROpen"],
  eyeSmile: ["ParamEyeSmile_Happy_L", "ParamEyeSmile_Happy_R", "ParamEyeSmile_Angry_L", "ParamEyeSmile_Angry_R"],
  eyeSquint: ["ParamEyeLSquint", "ParamEyeRSquint"],
  eyeEffect: ["ParamEyeCircles", "ParamPupilQuake_L1", "ParamPupilQuake_R1", "ParamEyeOpenBlink_L1", "ParamEyeOpenBlink_L2", "ParamEyeOpenBlinkOF_L1", "ParamEyeOpenBlinkOF_L2"],
  brow: ["ParamBrowLY", "ParamBrowRY"],
  mouthForm: ["ParamMouthForm"],
  mouthOpen: ["ParamMouthOpenY"],
  mouthShape: ["ParamMouthShape"],
  mouthThickness: ["ParamMouthThickness", "ParamMouthStraight"],
  mouthX: ["ParamMouthX"],
  jaw: ["ParamJawOpen"],
  tongue: ["ParamTongueOut"],
  cheek: ["ParamCheek"],
  cheekPuff: ["ParamCheekPuff"],
  mouthPucker: ["ParamMouthPuckerWiden"],
  mouthFunnel: ["ParamMouthFunnel"],
  mouthPress: ["ParamMouthPressLipOpen"],
  mouthShrug: ["ParamMouthShrug"],
  tearEffect: ["ParamCryDown_L", "ParamTearDown_1", "ParamTearDown_2", "ParamTearDown_3", "ParamTearDisappear_1", "ParamTearDisappear_2", "ParamTearDisappear_3"],
  emotionEffect: ["fire", "ParamBreathPhysics_L"],
  expressionLayer: [],
};

const WEIGHTED_FEATURES: Partial<Record<Live2DMotionFeature, number>> = {
  head: 1,
  body: 0.8,
  breath: 0.6,
  gaze: 0.7,
  eyeOpen: 0.9,
  eyeSmile: 0.35,
  eyeSquint: 0.35,
  eyeEffect: 0,
  brow: 0.9,
  mouthForm: 1,
  mouthOpen: 1,
  mouthShape: 0.35,
  mouthThickness: 0.25,
  mouthX: 0.35,
  jaw: 0.45,
  tongue: 0.25,
  cheek: 0.5,
  cheekPuff: 0.25,
  mouthPucker: 0.3,
  mouthFunnel: 0.3,
  mouthPress: 0.25,
  mouthShrug: 0.25,
  tearEffect: 0,
  emotionEffect: 0,
  expressionLayer: 0.6,
};

const CORE_FEATURES: Live2DMotionFeature[] = [
  "head",
  "gaze",
  "eyeOpen",
  "brow",
  "mouthForm",
  "mouthOpen",
];

export function buildMotionCapability(
  input: CharacterProfile | Live2DParameterManifest,
): Live2DMotionCapability {
  const manifest = "parameters" in input ? buildParameterManifest(input) : input;
  const safe = new Set(manifest.safeParameterIds);
  const byFeature: Record<Live2DMotionFeature, string[]> = emptyFeatureMap();

  for (const feature of Object.keys(FEATURE_IDS) as Live2DMotionFeature[]) {
    byFeature[feature] = FEATURE_IDS[feature].filter((id) => safe.has(id));
  }

  byFeature.expressionLayer = [
    ...(manifest.byRole.special_expression ?? []),
    ...(manifest.byRole.visibility ?? []),
  ].filter((id) => safe.has(id)).sort();

  const availableFeatures = (Object.keys(byFeature) as Live2DMotionFeature[])
    .filter((feature) => byFeature[feature].length > 0);
  const missingCoreFeatures = CORE_FEATURES.filter((feature) => byFeature[feature].length === 0);
  const totalWeight = Object.values(WEIGHTED_FEATURES).reduce((sum, value) => sum + (value ?? 0), 0);
  const availableWeight = availableFeatures.reduce((sum, feature) => sum + (WEIGHTED_FEATURES[feature] ?? 0), 0);
  const score = totalWeight > 0 ? clamp01(availableWeight / totalWeight) : 0;

  return {
    characterId: manifest.characterId,
    characterName: manifest.characterName,
    score,
    availableFeatures,
    missingCoreFeatures,
    byFeature,
    roleCounts: Object.fromEntries(
      Object.entries(manifest.byRole).map(([role, ids]) => [role, ids.length]),
    ),
    safeParameterIds: [...manifest.safeParameterIds],
    expressionPresetNames: [...manifest.expressionPresetNames],
  };
}

export function summarizeMotionCapability(capability: Live2DMotionCapability): string {
  const featureText = capability.availableFeatures.join(", ") || "none";
  const missingText = capability.missingCoreFeatures.length
    ? `missing=${capability.missingCoreFeatures.join(",")}`
    : "core=complete";
  return [
    `${capability.characterName} motion capability`,
    `score=${capability.score.toFixed(2)}`,
    missingText,
    `features=${featureText}`,
  ].join(" · ");
}

export function hasMotionFeature(
  capability: Live2DMotionCapability,
  feature: Live2DMotionFeature,
): boolean {
  return capability.byFeature[feature]?.length > 0;
}

function emptyFeatureMap(): Record<Live2DMotionFeature, string[]> {
  return {
    head: [],
    body: [],
    breath: [],
    gaze: [],
    eyeOpen: [],
    eyeSmile: [],
    eyeSquint: [],
    eyeEffect: [],
    brow: [],
    mouthForm: [],
    mouthOpen: [],
    mouthShape: [],
    mouthThickness: [],
    mouthX: [],
    jaw: [],
    tongue: [],
    cheek: [],
    cheekPuff: [],
    mouthPucker: [],
    mouthFunnel: [],
    mouthPress: [],
    mouthShrug: [],
    tearEffect: [],
    emotionEffect: [],
    expressionLayer: [],
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
