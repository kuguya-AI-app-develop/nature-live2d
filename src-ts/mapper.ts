import { applySpecialExpression, resolveSpecialExpression } from "./expression-layer.js";
import { normalizeIntent } from "./intent.js";
import { BASE_EMOTION_PRESETS } from "./presets.js";
import type {
  CharacterProfile,
  EmotionIntent,
  EmotionToneName,
  FacialPerformanceStyleName,
  NormalizedEmotionIntent,
} from "./types.js";

export function mapIntentToParams(
  intentInput: EmotionIntent,
  profile?: CharacterProfile,
): Record<string, number> {
  const intent = normalizeIntent(intentInput);
  const neutral = BASE_EMOTION_PRESETS.neutral;
  const target = BASE_EMOTION_PRESETS[intent.emotion] ?? neutral;
  const params: Record<string, number> = {};

  for (const id of new Set([...Object.keys(neutral), ...Object.keys(target)])) {
    if (id.startsWith("ParamExpression_")) continue;
    const baseValue = neutral[id] ?? 0;
    const targetValue = target[id] ?? baseValue;
    params[id] = baseValue + (targetValue - baseValue) * intent.intensity;
  }

  applyToneLayer(params, intent);
  applyFacialStyleLayer(params, intent);
  applyIntentModifiers(params, intent);
  applyToneReadability(params, intent);
  applyOptionalMouthAngleDetail(params, intent);
  applySemanticReadabilityAmplifier(params, intent);
  const withExpression = applySpecialExpression(params, resolveSpecialExpression(intent));
  return profile ? adaptParamsToProfile(withExpression, profile) : withExpression;
}

function applyFacialStyleLayer(params: Record<string, number>, intent: NormalizedEmotionIntent): void {
  if (!intent.facialStyle) return;
  const target = FACIAL_STYLE_PRESETS[intent.facialStyle];
  if (!target) return;
  const amount = clamp(0.72 + intent.intensity * 0.28, 0.72, 1);
  for (const [id, value] of Object.entries(target)) {
    const current = params[id] ?? 0;
    if (isEffectParam(id) && Math.abs(current) > Math.abs(value) && Math.sign(current) === Math.sign(value)) {
      params[id] = current;
    } else {
      params[id] = lerp(current, value, amount);
    }
  }
}

export function clampParams(
  params: Record<string, number>,
  profile: CharacterProfile,
): { params: Record<string, number>; warnings: string[] } {
  const allowed = new Set(profile.mainControls);
  const clamped: Record<string, number> = {};
  const warnings: string[] = [];

  for (const [id, value] of Object.entries(params)) {
    if (!allowed.has(id)) {
      warnings.push(`removed non-controllable parameter: ${id}`);
      continue;
    }
    const range = profile.parameters[id]?.range;
    if (!range) {
      warnings.push(`removed parameter without range: ${id}`);
      continue;
    }
    let next = Number(value);
    if (next < range.min) {
      warnings.push(`clamped ${id} from ${next} to ${range.min}`);
      next = range.min;
    } else if (next > range.max) {
      warnings.push(`clamped ${id} from ${next} to ${range.max}`);
      next = range.max;
    }
    clamped[id] = next;
  }

  return { params: clamped, warnings };
}

function applyIntentModifiers(params: Record<string, number>, intent: NormalizedEmotionIntent): void {
  const maps: Array<[Record<string, Record<string, number>>, string | null]> = [
    [
      {
        left: { ParamEyeBallX: -0.35 },
        right: { ParamEyeBallX: 0.35 },
        up: { ParamEyeBallY: 0.3 },
        down: { ParamEyeBallY: -0.3 },
        down_left: { ParamEyeBallX: -0.25, ParamEyeBallY: -0.25 },
        down_right: { ParamEyeBallX: 0.25, ParamEyeBallY: -0.25 },
      },
      intent.gaze,
    ],
    [
      {
        lowered: { ParamAngleY: -3 },
        raised: { ParamAngleY: 3 },
        tilted_left: { ParamAngleZ: 3 },
        tilted_right: { ParamAngleZ: -3 },
      },
      intent.head,
    ],
    [
      {
        soft: { ParamEyeLOpen: 0.85, ParamEyeROpen: 0.85 },
        wide: { ParamEyeLOpen: 1.35, ParamEyeROpen: 1.35 },
        sleepy: { ParamEyeLOpen: 0.45, ParamEyeROpen: 0.45 },
      },
      intent.eyes,
    ],
    [
      {
        soft_up: { ParamBrowLY: 0.25, ParamBrowRY: 0.25 },
        angry: { ParamBrowLY: -0.55, ParamBrowRY: -0.55 },
        worried: { ParamBrowLY: 0.4, ParamBrowRY: 0.4 },
      },
      intent.brows,
    ],
    [
      {
        small_smile: { ParamMouthForm: 0.48, ParamMouthOpenY: 0.08 },
        smile: { ParamMouthForm: 0.9, ParamMouthOpenY: 0.34, ParamMouthPuckerWiden: -0.14 },
        open: { ParamMouthOpenY: 1.12, ParamJawOpen: 0.58, ParamMouthFunnel: 0.26 },
        frown: { ParamMouthForm: -0.56, ParamMouthOpenY: 0.06, ParamMouthShrug: 0.24 },
        pout: { ParamMouthPuckerWiden: -0.4, ParamMouthFunnel: 0.35 },
        pressed: { ParamMouthPressLipOpen: -0.55, ParamMouthShrug: 0.2, ParamMouthOpenY: 0.02 },
        pucker: { ParamMouthPuckerWiden: -0.42, ParamMouthFunnel: 0.22 },
        funnel: { ParamMouthFunnel: 0.45, ParamMouthOpenY: 0.12 },
        tongue: { ParamTongueOut: 0.55, ParamMouthOpenY: 0.18, ParamMouthForm: 0.35 },
        shrug: { ParamMouthShrug: 0.35, ParamMouthPressLipOpen: -0.16 },
      },
      intent.mouth,
    ],
  ];

  for (const [mapping, key] of maps) {
    if (key && mapping[key]) Object.assign(params, mapping[key]);
  }
}

function applyToneLayer(params: Record<string, number>, intent: NormalizedEmotionIntent): void {
  if (!intent.tone) return;
  const target = TONE_LAYER_PRESETS[intent.tone];
  if (!target) return;
  const amount = clamp(0.52 + intent.intensity * 0.46, 0.45, 0.98);
  for (const [id, value] of Object.entries(target)) {
    params[id] = lerp(params[id] ?? 0, value, amount);
  }
}

function applyToneReadability(params: Record<string, number>, intent: NormalizedEmotionIntent): void {
  if (!intent.tone || intent.emotion === "neutral") return;
  const boost = toneReadabilityBoost(intent.tone, intent.intensity);
  if (boost.face <= 0 && boost.pose <= 0 && boost.effect <= 0) return;
  const neutral = BASE_EMOTION_PRESETS.neutral;

  for (const [id, value] of Object.entries(params)) {
    if (!Number.isFinite(value) || isExpressionLayerParam(id)) continue;
    const base = neutral[id] ?? 0;
    const delta = value - base;
    if (Math.abs(delta) < 0.001) continue;
    const amount = isPoseParam(id) ? boost.pose : isEffectParam(id) ? boost.effect : boost.face;
    if (amount <= 0) continue;
    params[id] = base + delta * (1 + amount);
  }

  applyToneReadabilityAnchors(params, intent, Math.max(boost.face, boost.effect));
}

function toneReadabilityBoost(
  tone: EmotionToneName,
  intensity: number,
): { face: number; pose: number; effect: number } {
  const base = clamp((intensity - 0.42) * 0.34, 0, 0.2);
  switch (tone) {
    case "celebratory":
    case "excited":
    case "delighted":
    case "startled":
    case "frustrated":
      return { face: base + 0.16, pose: base + 0.1, effect: base + 0.12 };
    case "nervous":
    case "flustered":
    case "skeptical":
    case "guarded":
      return { face: base + 0.18, pose: base + 0.08, effect: base + 0.1 };
    case "concerned":
    case "reassuring":
    case "tender":
    case "wistful":
      return { face: base + 0.14, pose: base + 0.06, effect: base + 0.08 };
    case "apologetic":
    case "disappointed":
    case "bashful":
    case "grateful":
    case "relieved":
      return { face: base + 0.12, pose: base + 0.05, effect: base + 0.06 };
    case "playful":
    case "amused":
    case "proud":
    case "focused":
    case "determined":
      return { face: base + 0.1, pose: base + 0.06, effect: base + 0.05 };
    default:
      return { face: base, pose: base * 0.5, effect: base * 0.5 };
  }
}

function applyToneReadabilityAnchors(
  params: Record<string, number>,
  intent: NormalizedEmotionIntent,
  amount: number,
): void {
  const anchor = clamp(0.3 + amount * 1.05, 0.24, 0.68);
  const atLeast = (id: string, value: number): void => {
    const base = BASE_EMOTION_PRESETS.neutral[id] ?? 0;
    params[id] = Math.max(params[id] ?? base, base + value * anchor);
  };
  const atMost = (id: string, value: number): void => {
    const base = BASE_EMOTION_PRESETS.neutral[id] ?? 0;
    params[id] = Math.min(params[id] ?? base, base + value * anchor);
  };
  const add = (id: string, value: number): void => {
    params[id] = (params[id] ?? 0) + value * anchor;
  };

  switch (intent.tone) {
    case "celebratory":
    case "excited":
    case "delighted":
      atLeast("ParamEyeSmile_Happy_L", 0.9);
      atLeast("ParamEyeSmile_Happy_R", 0.9);
      atLeast("ParamCheek", 0.82);
      atLeast("ParamMouthOpenY", 0.58);
      atLeast("ParamEyeOpenBlink_L1", 0.38);
      add("ParamBodyAngleY", 1.1);
      break;
    case "concerned":
      atLeast("ParamBrowLY", 0.86);
      atLeast("ParamBrowRY", 0.78);
      atMost("ParamEyeLOpen", -0.28);
      atMost("ParamEyeROpen", -0.2);
      atMost("ParamEyeBallY", -0.42);
      add("ParamMouthStraight", 0.36);
      add("ParamEyeCircles", 0.2);
      break;
    case "reassuring":
    case "tender":
      atLeast("ParamBrowLY", 0.42);
      atLeast("ParamBrowRY", 0.42);
      atMost("ParamEyeLOpen", -0.22);
      atMost("ParamEyeROpen", -0.22);
      atLeast("ParamEyeSmile_Happy_L", 0.34);
      atLeast("ParamEyeSmile_Happy_R", 0.34);
      atLeast("ParamCheek", 0.36);
      add("ParamBodyAngleX", 0.46);
      break;
    case "skeptical":
    case "guarded":
      atLeast("ParamEyeLSquint", 0.78);
      atMost("ParamEyeLOpen", -0.46);
      atLeast("ParamBrowRY", 0.62);
      atMost("ParamBrowLY", -0.34);
      atMost("ParamMouthX", -0.62);
      add("ParamMouthStraight", 0.42);
      add("ParamEyeCircles", 0.22);
      break;
    case "nervous":
    case "startled":
      atLeast("ParamEyeLOpen", 1.0);
      atLeast("ParamEyeROpen", 1.0);
      atLeast("ParamBrowLY", 0.82);
      atLeast("ParamBrowRY", 0.82);
      atLeast("ParamMouthOpenY", 0.82);
      atLeast("ParamPupilQuake_L1", 0.58);
      atLeast("ParamPupilQuake_R1", 0.58);
      break;
    case "flustered":
    case "bashful":
      atMost("ParamEyeLOpen", -0.34);
      atMost("ParamEyeROpen", -0.28);
      atMost("ParamEyeBallY", -0.52);
      atLeast("ParamCheek", 0.95);
      atLeast("ParamCheekPuff2", 0.52);
      add("ParamMouthShrug", 0.28);
      break;
    case "apologetic":
    case "wistful":
    case "disappointed":
      atMost("ParamEyeLOpen", -0.34);
      atMost("ParamEyeROpen", -0.24);
      atMost("ParamEyeBallY", -0.44);
      atLeast("ParamBrowLY", 0.74);
      atLeast("ParamBrowRY", 0.56);
      atMost("ParamMouthForm", -0.32);
      add("ParamMouthShrug", 0.26);
      add("ParamTearDown_1", 0.28);
      break;
    case "frustrated":
    case "focused":
    case "determined":
      atMost("ParamBrowLY", -0.78);
      atMost("ParamBrowRY", -0.78);
      atLeast("ParamEyeSmile_Angry_L", 0.62);
      atLeast("ParamEyeSmile_Angry_R", 0.62);
      atMost("ParamMouthPressLipOpen", -0.72);
      add("fire", intent.tone === "frustrated" ? 0.42 : 0.12);
      break;
    case "playful":
    case "amused":
      atLeast("ParamEyeLSquint", 0.46);
      atLeast("ParamMouthX", 0.42);
      atLeast("ParamCheek", 0.42);
      add("ParamAngleZ", -0.95);
      break;
    default:
      break;
  }
}

function applyOptionalMouthAngleDetail(
  params: Record<string, number>,
  intent: NormalizedEmotionIntent,
): void {
  const amount = clamp(0.42 + intent.intensity * 0.48, 0.32, 0.9);
  const key = intent.tone ?? intent.emotion;
  const style = intent.facialStyle;
  const mouth = intent.mouth;
  const add = (id: string, value: number): void => {
    params[id] = (params[id] ?? 0) + value * amount;
  };
  const atLeast = (id: string, value: number): void => {
    params[id] = Math.max(params[id] ?? 0, value * amount);
  };
  const atMost = (id: string, value: number): void => {
    params[id] = Math.min(params[id] ?? 0, value * amount);
  };

  if (
    key === "excited"
    || key === "delighted"
    || key === "celebratory"
    || key === "happy"
    || style === "radiant"
    || style === "bright"
  ) {
    atLeast("ParamMouthAngleModify_YU", 0.42);
    add("ParamMouthAngleModify_XL", -0.14);
    add("ParamMouthAngleModify_XR", 0.14);
  }
  if (
    key === "reassuring"
    || key === "tender"
    || key === "relieved"
    || key === "grateful"
    || style === "gentle"
    || style === "relieved"
    || style === "grateful"
  ) {
    atLeast("ParamMouthAngleModify_YU", 0.22);
    add("ParamMouthAngleModify_YD", -0.08);
  }
  if (
    key === "sad"
    || key === "crying"
    || key === "concerned"
    || key === "wistful"
    || key === "disappointed"
    || key === "apologetic"
    || style === "hurt"
    || style === "concerned"
  ) {
    atLeast("ParamMouthAngleModify_YD", 0.32);
    atMost("ParamMouthAngleModify_YU", -0.1);
  }
  if (
    key === "panic"
    || key === "nervous"
    || key === "startled"
    || key === "surprised"
    || style === "shaken"
    || style === "frozen"
    || style === "bracing"
    || mouth === "open"
    || mouth === "funnel"
  ) {
    atLeast("ParamMouthAngleModify_YD", 0.34);
    add("ParamMouthAngleModify_YU", 0.12);
  }
  if (
    key === "teasing"
    || key === "playful"
    || key === "amused"
    || key === "skeptical"
    || style === "playful_smirk"
    || style === "mischievous"
    || style === "skeptical"
  ) {
    add("ParamMouthAngleModify_XL", -0.38);
    add("ParamMouthAngleModify_XR", 0.24);
    atLeast("ParamMouthAngleModify_YU", 0.16);
  }
  if (
    key === "angry"
    || key === "focused"
    || key === "determined"
    || key === "guarded"
    || key === "frustrated"
    || style === "determined"
    || mouth === "pressed"
  ) {
    add("ParamMouthAngleModify_XL", 0.18);
    add("ParamMouthAngleModify_XR", -0.18);
    atMost("ParamMouthAngleModify_YU", -0.12);
  }
  if (mouth === "tongue" || style === "mischievous") {
    add("ParamMouthAngleModify_XL", -0.22);
    add("ParamMouthAngleModify_XR", 0.22);
    atLeast("ParamMouthAngleModify_YD", 0.24);
  }
}

function applySemanticReadabilityAmplifier(
  params: Record<string, number>,
  intent: NormalizedEmotionIntent,
): void {
  if (intent.emotion === "neutral") return;
  const semanticCue = Boolean(
    intent.presetId
    || intent.tone
    || intent.facialStyle
    || intent.specialExpression
    || intent.gaze
    || intent.head
    || intent.eyes
    || intent.brows
    || intent.mouth,
  );
  if (!semanticCue) return;

  const neutral = BASE_EMOTION_PRESETS.neutral;
  const faceScale = 1 + clamp(0.2 + intent.intensity * 0.32, 0.22, 0.58);
  const poseScale = 1 + clamp(0.12 + intent.intensity * 0.18, 0.12, 0.34);
  const effectScale = 1 + clamp(0.22 + intent.intensity * 0.32, 0.22, 0.62);

  for (const [id, value] of Object.entries(params)) {
    if (!Number.isFinite(value) || isExpressionLayerParam(id)) continue;
    const base = neutral[id] ?? 0;
    const delta = value - base;
    if (Math.abs(delta) < 0.001) continue;
    const softTone = intent.tone === "reassuring"
      || intent.tone === "tender"
      || intent.tone === "grateful"
      || intent.tone === "relieved";
    const softMouthOpen = softTone && /Param(?:MouthOpenY|JawOpen|MouthFunnel|MouthPuckerWiden)/.test(id);
    const scale = softMouthOpen
      ? Math.min(1.1, faceScale)
      : isPoseParam(id)
        ? poseScale
        : isEffectParam(id)
          ? effectScale
          : faceScale;
    params[id] = base + delta * scale;
  }
}

const TONE_LAYER_PRESETS: Record<EmotionToneName, Record<string, number>> = {
  concerned: {
    ParamEyeLOpen: 0.82,
    ParamEyeROpen: 0.86,
    ParamEyeLSquint: 0.16,
    ParamEyeRSquint: 0.12,
    ParamEyeBallY: -0.18,
    ParamBrowLY: 0.62,
    ParamBrowRY: 0.56,
    ParamMouthForm: -0.28,
    ParamMouthOpenY: 0.08,
    ParamMouthStraight: 0.34,
    ParamMouthShrug: 0.14,
    ParamAngleY: -2.1,
    ParamBodyAngleX: -0.62,
    ParamTearDown_1: 0.18,
    ParamEyeCircles: 0.18,
  },
  reassuring: {
    ParamEyeLOpen: 0.84,
    ParamEyeROpen: 0.84,
    ParamEyeSmile_Happy_L: 0.12,
    ParamEyeSmile_Happy_R: 0.12,
    ParamBrowLY: 0.24,
    ParamBrowRY: 0.24,
    ParamMouthForm: 0.44,
    ParamMouthOpenY: 0.09,
    ParamJawOpen: 0.06,
    ParamMouthFunnel: 0.04,
    ParamMouthShrug: 0.04,
    ParamMouthPuckerWiden: -0.06,
    ParamMouthPressLipOpen: -0.08,
    ParamMouthShape: 0.12,
    ParamCheek: 0.14,
    ParamAngleY: -0.65,
    ParamBodyAngleX: 0.45,
    ParamBreath: 0.58,
    ParamBreathPhysics_L: 0.2,
    ParamEyeCircles: 0.04,
    ParamPupilQuake_L1: 0.04,
    ParamPupilQuake_R1: 0.04,
  },
  relieved: {
    ParamEyeLOpen: 0.64,
    ParamEyeROpen: 0.64,
    ParamEyeSmile_Happy_L: 0.42,
    ParamEyeSmile_Happy_R: 0.42,
    ParamBrowLY: 0.08,
    ParamBrowRY: 0.08,
    ParamMouthForm: 0.6,
    ParamMouthOpenY: 0.16,
    ParamMouthShape: 0.18,
    ParamCheek: 0.34,
    ParamAngleY: 1.55,
    ParamBodyAngleY: 0.85,
    ParamBreath: 0.66,
    ParamBreathPhysics_L: 0.32,
  },
  proud: {
    ParamEyeLOpen: 0.96,
    ParamEyeROpen: 0.96,
    ParamEyeSmile_Happy_L: 0.58,
    ParamEyeSmile_Happy_R: 0.58,
    ParamBrowLY: -0.06,
    ParamBrowRY: -0.06,
    ParamMouthForm: 0.92,
    ParamMouthOpenY: 0.28,
    ParamMouthShape: 0.26,
    ParamCheek: 0.46,
    ParamAngleY: 3.1,
    ParamAngleZ: -1.7,
    ParamBodyAngleY: 2.25,
    ParamBodyAngleX: 1.05,
    ParamBreathPhysics_L: 0.3,
  },
  playful: {
    ParamEyeLOpen: 0.74,
    ParamEyeROpen: 0.92,
    ParamEyeSmile_Happy_L: 0.2,
    ParamEyeLSquint: 0.28,
    ParamEyeBallX: 0.2,
    ParamMouthForm: 0.68,
    ParamMouthOpenY: 0.18,
    ParamMouthX: 0.26,
    ParamTongueOut: 0.14,
    ParamMouthShape: 0.14,
    ParamAngleZ: -4.1,
    ParamCheek: 0.22,
    ParamBreathPhysics_L: 0.24,
  },
  bashful: {
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
    ParamEyeSmile_Happy_L: 0.16,
    ParamEyeSmile_Happy_R: 0.16,
    ParamEyeBallY: -0.32,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamMouthForm: 0.46,
    ParamMouthOpenY: 0.06,
    ParamMouthShape: 0.12,
    ParamCheek: 1,
    ParamCheekPuff2: 0.24,
    ParamAngleY: -4.2,
    ParamAngleZ: 2.4,
    ParamBodyAngleX: -1.05,
    ParamBreathPhysics_L: 0.18,
  },
  flustered: {
    ParamEyeLOpen: 0.62,
    ParamEyeROpen: 0.78,
    ParamEyeSmile_Happy_L: 0.08,
    ParamEyeSmile_Happy_R: 0.14,
    ParamEyeBallX: -0.18,
    ParamEyeBallY: -0.38,
    ParamBrowLY: 0.38,
    ParamBrowRY: 0.28,
    ParamMouthForm: 0.18,
    ParamMouthOpenY: 0.14,
    ParamMouthX: -0.14,
    ParamMouthShrug: 0.3,
    ParamMouthPuckerWiden: -0.24,
    ParamMouthShape: 0.08,
    ParamCheek: 1,
    ParamCheekPuff: 0.28,
    ParamCheekPuff2: 0.38,
    ParamAngleY: -5.1,
    ParamAngleZ: 4.2,
    ParamBodyAngleX: -1.45,
    ParamBodyAngleZ: 0.9,
    ParamBreathPhysics_L: 0.34,
  },
  determined: {
    ParamEyeLOpen: 1.04,
    ParamEyeROpen: 1.04,
    ParamEyeSmile_Angry_L: 0.4,
    ParamEyeSmile_Angry_R: 0.4,
    ParamBrowLY: -0.48,
    ParamBrowRY: -0.48,
    ParamMouthForm: -0.06,
    ParamMouthOpenY: 0.04,
    ParamMouthStraight: 0.3,
    ParamMouthPressLipOpen: -0.62,
    ParamAngleY: 2.9,
    ParamBodyAngleX: 1.35,
    ParamBreathPhysics_L: 0.28,
  },
  disappointed: {
    ParamEyeLOpen: 0.62,
    ParamEyeROpen: 0.62,
    ParamEyeLSquint: 0.12,
    ParamEyeRSquint: 0.12,
    ParamEyeBallY: -0.34,
    ParamBrowLY: 0.42,
    ParamBrowRY: 0.42,
    ParamMouthForm: -0.42,
    ParamMouthOpenY: 0.06,
    ParamMouthStraight: 0.2,
    ParamAngleY: -3.2,
    ParamBodyAngleX: -0.75,
    ParamTearDown_1: 0.18,
  },
  nervous: {
    ParamEyeLOpen: 1.22,
    ParamEyeROpen: 1.22,
    ParamEyeBallX: 0.12,
    ParamBrowLY: 0.58,
    ParamBrowRY: 0.58,
    ParamMouthForm: -0.28,
    ParamMouthOpenY: 0.38,
    ParamMouthShape: 0.1,
    ParamAngleZ: 4.25,
    ParamBodyAngleX: -1.65,
    ParamBodyAngleY: 0.75,
    ParamPupilQuake_L1: 0.38,
    ParamPupilQuake_R1: 0.38,
    ParamBreathPhysics_L: 0.52,
  },
  excited: {
    ParamEyeLOpen: 1.08,
    ParamEyeROpen: 1.08,
    ParamEyeSmile_Happy_L: 0.64,
    ParamEyeSmile_Happy_R: 0.64,
    ParamMouthForm: 0.94,
    ParamMouthOpenY: 0.56,
    ParamJawOpen: 0.3,
    ParamMouthShape: 0.36,
    ParamMouthThickness: 0.16,
    ParamCheek: 0.72,
    ParamCheekPuff: 0.22,
    ParamCheekPuff2: 0.2,
    ParamAngleY: 3.4,
    ParamAngleZ: 3.6,
    ParamBodyAngleX: 1.85,
    ParamBodyAngleY: 2.05,
    ParamBreath: 0.82,
    ParamBreathPhysics_L: 0.58,
    ParamEyeOpenBlink_L1: 0.34,
    ParamEyeOpenBlinkOF_L1: 0.24,
  },
  delighted: {
    ParamEyeLOpen: 1.16,
    ParamEyeROpen: 1.16,
    ParamEyeSmile_Happy_L: 0.52,
    ParamEyeSmile_Happy_R: 0.52,
    ParamEyeBallY: 0.12,
    ParamBrowLY: 0.42,
    ParamBrowRY: 0.42,
    ParamMouthForm: 0.82,
    ParamMouthOpenY: 0.62,
    ParamJawOpen: 0.34,
    ParamMouthShape: 0.26,
    ParamMouthFunnel: 0.14,
    ParamCheek: 0.64,
    ParamCheekPuff: 0.16,
    ParamAngleY: 3.6,
    ParamAngleZ: -1.1,
    ParamBodyAngleX: 1.45,
    ParamBodyAngleY: 1.7,
    ParamBreath: 0.76,
    ParamBreathPhysics_L: 0.5,
    ParamEyeOpenBlink_L1: 0.28,
    ParamEyeOpenBlinkOF_L1: 0.18,
    ParamPupilQuake_L1: 0.1,
    ParamPupilQuake_R1: 0.1,
  },
  celebratory: {
    ParamEyeLOpen: 1.04,
    ParamEyeROpen: 1.04,
    ParamEyeSmile_Happy_L: 0.72,
    ParamEyeSmile_Happy_R: 0.72,
    ParamBrowLY: 0.28,
    ParamBrowRY: 0.28,
    ParamMouthForm: 0.98,
    ParamMouthOpenY: 0.72,
    ParamJawOpen: 0.42,
    ParamMouthShape: 0.42,
    ParamMouthThickness: 0.18,
    ParamCheek: 0.78,
    ParamCheekPuff: 0.28,
    ParamAngleY: 4.4,
    ParamAngleZ: 2.2,
    ParamBodyAngleX: 2.25,
    ParamBodyAngleY: 2.8,
    ParamBreath: 0.9,
    ParamBreathPhysics_L: 0.7,
    ParamEyeOpenBlink_L1: 0.38,
    ParamEyeOpenBlink_L2: 0.22,
    ParamEyeOpenBlinkOF_L1: 0.28,
  },
  grateful: {
    ParamEyeLOpen: 0.72,
    ParamEyeROpen: 0.72,
    ParamEyeSmile_Happy_L: 0.46,
    ParamEyeSmile_Happy_R: 0.46,
    ParamEyeBallY: -0.12,
    ParamBrowLY: 0.24,
    ParamBrowRY: 0.24,
    ParamMouthForm: 0.68,
    ParamMouthOpenY: 0.18,
    ParamMouthShape: 0.16,
    ParamCheek: 0.6,
    ParamAngleY: -1.3,
    ParamBodyAngleX: 0.95,
    ParamBreathPhysics_L: 0.24,
  },
  tender: {
    ParamEyeLOpen: 0.68,
    ParamEyeROpen: 0.68,
    ParamEyeSmile_Happy_L: 0.42,
    ParamEyeSmile_Happy_R: 0.42,
    ParamEyeBallY: -0.08,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamMouthForm: 0.58,
    ParamMouthOpenY: 0.12,
    ParamMouthShape: 0.14,
    ParamCheek: 0.48,
    ParamAngleY: -1.6,
    ParamAngleZ: 1.2,
    ParamBodyAngleX: 0.72,
    ParamBreath: 0.58,
    ParamBreathPhysics_L: 0.2,
  },
  amused: {
    ParamEyeLOpen: 0.64,
    ParamEyeROpen: 0.8,
    ParamEyeSmile_Happy_L: 0.34,
    ParamEyeSmile_Happy_R: 0.28,
    ParamEyeLSquint: 0.34,
    ParamEyeRSquint: 0.18,
    ParamMouthForm: 0.76,
    ParamMouthOpenY: 0.22,
    ParamMouthX: 0.34,
    ParamMouthShape: 0.18,
    ParamTongueOut: 0.12,
    ParamCheek: 0.32,
    ParamAngleZ: -4.3,
    ParamBodyAngleZ: -1.5,
    ParamBreathPhysics_L: 0.22,
  },
  skeptical: {
    ParamEyeLOpen: 0.74,
    ParamEyeROpen: 1.08,
    ParamEyeLSquint: 0.36,
    ParamBrowLY: -0.12,
    ParamBrowRY: 0.38,
    ParamEyeBallX: -0.28,
    ParamMouthForm: -0.18,
    ParamMouthOpenY: 0.05,
    ParamMouthX: -0.28,
    ParamMouthStraight: 0.24,
    ParamMouthShrug: 0.28,
    ParamAngleZ: -3.4,
    ParamBodyAngleZ: -0.9,
    ParamEyeCircles: 0.16,
  },
  focused: {
    ParamEyeLOpen: 1.18,
    ParamEyeROpen: 1.18,
    ParamEyeSmile_Angry_L: 0.12,
    ParamEyeSmile_Angry_R: 0.12,
    ParamEyeLSquint: 0.08,
    ParamEyeRSquint: 0.08,
    ParamBrowLY: -0.12,
    ParamBrowRY: -0.12,
    ParamMouthForm: 0.08,
    ParamMouthOpenY: 0.06,
    ParamMouthPressLipOpen: -0.34,
    ParamMouthStraight: 0.2,
    ParamAngleY: 1.9,
    ParamBodyAngleX: 1.3,
    ParamBreath: 0.7,
    ParamBreathPhysics_L: 0.28,
  },
  guarded: {
    ParamEyeLOpen: 0.84,
    ParamEyeROpen: 1.08,
    ParamEyeLSquint: 0.3,
    ParamEyeBallX: -0.2,
    ParamBrowLY: -0.32,
    ParamBrowRY: -0.12,
    ParamMouthForm: -0.16,
    ParamMouthOpenY: 0.02,
    ParamMouthX: -0.2,
    ParamMouthStraight: 0.26,
    ParamMouthPressLipOpen: -0.5,
    ParamAngleY: 1.4,
    ParamAngleZ: -3.1,
    ParamBodyAngleX: 0.9,
    ParamBodyAngleZ: -0.8,
    ParamBreath: 0.58,
    ParamBreathPhysics_L: 0.18,
  },
  apologetic: {
    ParamEyeLOpen: 0.5,
    ParamEyeROpen: 0.78,
    ParamEyeBallY: -0.3,
    ParamBrowLY: 0.48,
    ParamBrowRY: 0.3,
    ParamMouthForm: -0.22,
    ParamMouthOpenY: 0.08,
    ParamMouthX: -0.3,
    ParamMouthStraight: 0.16,
    ParamMouthShrug: 0.38,
    ParamCheek: 0.42,
    ParamAngleY: -4.5,
    ParamAngleZ: 1.8,
    ParamBodyAngleX: -1.1,
    ParamTearDown_1: 0.12,
  },
  wistful: {
    ParamEyeLOpen: 0.58,
    ParamEyeROpen: 0.72,
    ParamEyeLSquint: 0.12,
    ParamEyeRSquint: 0.06,
    ParamEyeBallX: -0.12,
    ParamEyeBallY: -0.24,
    ParamBrowLY: 0.42,
    ParamBrowRY: 0.28,
    ParamMouthForm: -0.22,
    ParamMouthOpenY: 0.05,
    ParamMouthX: -0.12,
    ParamMouthStraight: 0.18,
    ParamMouthShrug: 0.2,
    ParamAngleY: -3.7,
    ParamAngleZ: -2.2,
    ParamBodyAngleX: -0.82,
    ParamTearDown_1: 0.12,
  },
  frustrated: {
    ParamEyeLOpen: 0.92,
    ParamEyeROpen: 0.92,
    ParamEyeSmile_Angry_L: 0.52,
    ParamEyeSmile_Angry_R: 0.52,
    ParamBrowLY: -0.62,
    ParamBrowRY: -0.62,
    ParamMouthForm: -0.5,
    ParamMouthOpenY: 0.08,
    ParamMouthPressLipOpen: -0.54,
    ParamMouthStraight: 0.32,
    ParamMouthShrug: 0.26,
    ParamAngleY: 1.3,
    ParamAngleZ: -3.2,
    ParamBodyAngleX: 1.45,
    fire: 0.48,
    ParamBreathPhysics_L: 0.48,
  },
  startled: {
    ParamEyeLOpen: 1.5,
    ParamEyeROpen: 1.5,
    ParamEyeBallY: 0.24,
    ParamBrowLY: 0.72,
    ParamBrowRY: 0.72,
    ParamMouthForm: -0.18,
    ParamMouthOpenY: 0.96,
    ParamJawOpen: 0.58,
    ParamMouthFunnel: 0.34,
    ParamMouthShape: 0.16,
    ParamAngleY: 2.7,
    ParamAngleZ: 4.6,
    ParamBodyAngleX: -1.85,
    ParamBodyAngleY: 0.9,
    ParamPupilQuake_L1: 0.58,
    ParamPupilQuake_R1: 0.58,
    ParamEyeOpenBlink_L1: 0.45,
    ParamEyeOpenBlinkOF_L1: 0.38,
    ParamBreathPhysics_L: 0.58,
  },
};

const FACIAL_STYLE_PRESETS: Record<FacialPerformanceStyleName, Record<string, number>> = {
  radiant: {
    ParamEyeSmile_Happy_L: 0.94,
    ParamEyeSmile_Happy_R: 0.94,
    ParamMouthForm: 1,
    ParamMouthOpenY: 0.78,
    ParamJawOpen: 0.42,
    ParamMouthShape: 0.52,
    ParamCheek: 1,
    ParamCheekPuff: 0.38,
    ParamEyeOpenBlink_L1: 0.48,
    ParamEyeOpenBlink_L2: 0.3,
    ParamEyeOpenBlinkOF_L1: 0.34,
    ParamEyeOpenBlinkOF_L2: 0.24,
  },
  bright: {
    ParamEyeLOpen: 1.34,
    ParamEyeROpen: 1.34,
    ParamEyeSmile_Happy_L: 0.5,
    ParamEyeSmile_Happy_R: 0.5,
    ParamBrowLY: 0.46,
    ParamBrowRY: 0.46,
    ParamMouthForm: 0.86,
    ParamMouthOpenY: 0.58,
    ParamMouthShape: 0.38,
    ParamCheek: 0.72,
    ParamEyeOpenBlink_L1: 0.34,
    ParamEyeOpenBlinkOF_L1: 0.26,
  },
  grateful: {
    ParamEyeLOpen: 0.62,
    ParamEyeROpen: 0.62,
    ParamEyeSmile_Happy_L: 0.68,
    ParamEyeSmile_Happy_R: 0.68,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamMouthForm: 0.74,
    ParamMouthOpenY: 0.15,
    ParamMouthShape: 0.22,
    ParamCheek: 0.68,
    ParamCheekPuff: 0.18,
  },
  gentle: {
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
    ParamEyeSmile_Happy_L: 0.44,
    ParamEyeSmile_Happy_R: 0.44,
    ParamBrowLY: 0.36,
    ParamBrowRY: 0.36,
    ParamMouthForm: 0.6,
    ParamMouthOpenY: 0.1,
    ParamMouthShape: 0.18,
    ParamCheek: 0.46,
  },
  relieved: {
    ParamEyeLOpen: 0.6,
    ParamEyeROpen: 0.6,
    ParamEyeSmile_Happy_L: 0.54,
    ParamEyeSmile_Happy_R: 0.54,
    ParamBrowLY: 0.12,
    ParamBrowRY: 0.12,
    ParamMouthForm: 0.7,
    ParamMouthOpenY: 0.14,
    ParamMouthShape: 0.18,
    ParamCheek: 0.42,
    ParamBreath: 0.72,
    ParamBreathPhysics_L: 0.34,
  },
  playful_smirk: {
    ParamEyeLOpen: 0.62,
    ParamEyeROpen: 0.96,
    ParamEyeLSquint: 0.58,
    ParamEyeRSquint: 0.24,
    ParamEyeBallX: -0.24,
    ParamMouthForm: 0.74,
    ParamMouthOpenY: 0.14,
    ParamMouthX: 0.5,
    ParamMouthShape: 0.18,
    ParamTongueOut: 0.1,
    ParamCheek: 0.3,
  },
  mischievous: {
    ParamEyeLOpen: 0.56,
    ParamEyeROpen: 0.94,
    ParamEyeLSquint: 0.64,
    ParamEyeRSquint: 0.3,
    ParamEyeBallX: -0.28,
    ParamMouthForm: 0.76,
    ParamMouthOpenY: 0.2,
    ParamMouthX: 0.56,
    ParamTongueOut: 0.46,
    ParamCheek: 0.36,
  },
  flustered: {
    ParamEyeLOpen: 0.54,
    ParamEyeROpen: 0.74,
    ParamEyeBallX: -0.18,
    ParamEyeBallY: -0.42,
    ParamBrowLY: 0.44,
    ParamBrowRY: 0.3,
    ParamMouthForm: 0.12,
    ParamMouthOpenY: 0.14,
    ParamMouthX: -0.2,
    ParamMouthShrug: 0.46,
    ParamMouthPuckerWiden: -0.42,
    ParamCheek: 1,
    ParamCheekPuff: 0.48,
    ParamCheekPuff2: 0.58,
  },
  skeptical: {
    ParamEyeLOpen: 0.66,
    ParamEyeROpen: 1.16,
    ParamEyeLSquint: 0.58,
    ParamEyeRSquint: 0.34,
    ParamBrowLY: -0.3,
    ParamBrowRY: 0.56,
    ParamMouthForm: -0.22,
    ParamMouthOpenY: 0.04,
    ParamMouthX: -0.54,
    ParamMouthStraight: 0.42,
    ParamMouthShrug: 0.4,
    ParamEyeCircles: 0.2,
  },
  concerned: {
    ParamEyeLOpen: 0.72,
    ParamEyeROpen: 0.82,
    ParamEyeLSquint: 0.2,
    ParamEyeRSquint: 0.16,
    ParamEyeBallY: -0.2,
    ParamBrowLY: 0.7,
    ParamBrowRY: 0.62,
    ParamMouthForm: -0.3,
    ParamMouthOpenY: 0.08,
    ParamMouthStraight: 0.42,
    ParamMouthShrug: 0.26,
    ParamTearDown_1: 0.16,
  },
  shaken: {
    ParamEyeLOpen: 1.62,
    ParamEyeROpen: 1.62,
    ParamBrowLY: 0.86,
    ParamBrowRY: 0.86,
    ParamMouthForm: -0.34,
    ParamMouthOpenY: 1.28,
    ParamJawOpen: 0.7,
    ParamMouthFunnel: 0.42,
    ParamEyeCircles: 0.2,
    ParamPupilQuake_L1: 0.76,
    ParamPupilQuake_R1: 0.76,
    ParamEyeOpenBlink_L1: 0.54,
    ParamEyeOpenBlink_L2: 0.3,
    ParamEyeOpenBlinkOF_L1: 0.44,
    ParamEyeOpenBlinkOF_L2: 0.28,
  },
  frozen: {
    ParamEyeLOpen: 1.78,
    ParamEyeROpen: 1.78,
    ParamBrowLY: 0.94,
    ParamBrowRY: 0.94,
    ParamMouthOpenY: 0.74,
    ParamJawOpen: 0.48,
    ParamMouthFunnel: 0.58,
    ParamMouthPuckerWiden: 0.24,
    ParamEyeCircles: 0.68,
    ParamPupilQuake_L1: 0.94,
    ParamPupilQuake_R1: 0.94,
    ParamEyeOpenBlink_L1: 0.62,
    ParamEyeOpenBlink_L2: 0.4,
    ParamEyeOpenBlinkOF_L1: 0.5,
    ParamEyeOpenBlinkOF_L2: 0.36,
  },
  bracing: {
    ParamEyeLOpen: 0.34,
    ParamEyeROpen: 0.34,
    ParamEyeLSquint: 0.88,
    ParamEyeRSquint: 0.88,
    ParamBrowLY: 0.78,
    ParamBrowRY: 0.78,
    ParamMouthOpenY: 0.7,
    ParamJawOpen: 0.46,
    ParamMouthFunnel: 0.44,
    ParamMouthPuckerWiden: 0.32,
    ParamEyeCircles: 0.3,
    ParamPupilQuake_L1: 0.44,
    ParamPupilQuake_R1: 0.44,
  },
  determined: {
    ParamEyeLOpen: 1.1,
    ParamEyeROpen: 1.1,
    ParamEyeSmile_Angry_L: 0.58,
    ParamEyeSmile_Angry_R: 0.58,
    ParamBrowLY: -0.74,
    ParamBrowRY: -0.74,
    ParamMouthForm: -0.24,
    ParamMouthOpenY: 0.04,
    ParamMouthPressLipOpen: -0.78,
    ParamMouthStraight: 0.48,
    fire: 0.32,
  },
  hurt: {
    ParamEyeLOpen: 0.48,
    ParamEyeROpen: 0.62,
    ParamEyeLSquint: 0.22,
    ParamEyeRSquint: 0.16,
    ParamEyeBallY: -0.34,
    ParamBrowLY: 0.72,
    ParamBrowRY: 0.58,
    ParamMouthForm: -0.58,
    ParamMouthOpenY: 0.08,
    ParamMouthStraight: 0.3,
    ParamMouthShrug: 0.56,
    ParamTearDown_1: 0.36,
    ParamCryDown_L: 0.18,
  },
  sleepy: {
    ParamEyeLOpen: 0.28,
    ParamEyeROpen: 0.28,
    ParamEyeLSquint: 0.34,
    ParamEyeRSquint: 0.34,
    ParamEyeBallY: -0.24,
    ParamMouthFunnel: 0.14,
    ParamEyeCircles: 0.18,
  },
  yawning: {
    ParamEyeLOpen: 0.26,
    ParamEyeROpen: 0.26,
    ParamEyeLSquint: 0.38,
    ParamEyeRSquint: 0.38,
    ParamEyeBallY: -0.28,
    ParamMouthOpenY: 0.96,
    ParamJawOpen: 0.64,
    ParamMouthFunnel: 0.64,
    ParamMouthPuckerWiden: 0.3,
    ParamEyeCircles: 0.2,
  },
};

function isPoseParam(id: string): boolean {
  return /^Param(?:Body)?Angle[XYZ]$/.test(id);
}

function isEffectParam(id: string): boolean {
  return id === "fire"
    || id === "ParamBreathPhysics_L"
    || id.startsWith("ParamTear")
    || id.startsWith("ParamCryDown")
    || id.startsWith("ParamPupilQuake")
    || id.startsWith("ParamEyeOpenBlink")
    || id === "ParamEyeCircles";
}

function isExpressionLayerParam(id: string): boolean {
  return id.startsWith("ParamExpression_") || id.startsWith("ParamHide_") || id.includes("Hide_");
}

function adaptParamsToProfile(
  params: Record<string, number>,
  profile: CharacterProfile,
): Record<string, number> {
  const supported = new Set(profile.mainControls);
  const next = { ...params };
  const has = (id: string) => supported.has(id);
  const add = (id: string, value: number): void => {
    if (!has(id) || !Number.isFinite(value) || value === 0) return;
    next[id] = (next[id] ?? 0) + value;
  };
  const fold = (sourceId: string, targets: Array<[string, number]>): void => {
    if (has(sourceId)) return;
    const value = next[sourceId];
    if (typeof value !== "number" || value === 0) {
      delete next[sourceId];
      return;
    }
    for (const [targetId, amount] of targets) add(targetId, value * amount);
    delete next[sourceId];
  };

  fold("ParamJawOpen", [["ParamMouthOpenY", 0.55]]);
  fold("ParamTongueOut", [["ParamMouthOpenY", 0.24], ["ParamMouthForm", 0.22]]);
  fold("ParamMouthFunnel", [["ParamMouthOpenY", 0.26], ["ParamMouthForm", -0.18], ["ParamMouthPuckerWiden", -0.22]]);
  fold("ParamMouthPuckerWiden", [["ParamMouthForm", -0.22], ["ParamMouthOpenY", 0.08]]);
  fold("ParamMouthPressLipOpen", [["ParamMouthForm", -0.18], ["ParamMouthOpenY", -0.04]]);
  fold("ParamMouthShrug", [["ParamMouthForm", -0.16], ["ParamMouthOpenY", 0.04]]);
  fold("ParamCheekPuff", [["ParamCheek", 0.38], ["ParamMouthForm", 0.08]]);
  fold("ParamCheekPuff2", [["ParamCheekPuff", 0.45], ["ParamCheek", 0.28], ["ParamMouthForm", 0.06]]);
  fold("ParamEyeSmile_Happy_L", [["ParamEyeLOpen", -0.12], ["ParamMouthForm", 0.1], ["ParamCheek", 0.08]]);
  fold("ParamEyeSmile_Happy_R", [["ParamEyeROpen", -0.12], ["ParamMouthForm", 0.1], ["ParamCheek", 0.08]]);
  fold("ParamEyeSmile_Angry_L", [["ParamEyeLOpen", -0.06], ["ParamBrowLY", -0.12]]);
  fold("ParamEyeSmile_Angry_R", [["ParamEyeROpen", -0.06], ["ParamBrowRY", -0.12]]);
  fold("ParamEyeLSquint", [["ParamEyeLOpen", -0.18], ["ParamBrowLY", -0.04]]);
  fold("ParamEyeRSquint", [["ParamEyeROpen", -0.18], ["ParamBrowRY", -0.04]]);
  fold("ParamMouthShape", [["ParamMouthForm", 0.22], ["ParamMouthOpenY", 0.08]]);
  fold("ParamMouthThickness", [["ParamMouthForm", 0.1]]);
  fold("ParamMouthStraight", [["ParamMouthForm", -0.16], ["ParamMouthOpenY", -0.03]]);
  fold("ParamBreathPhysics_L", [["ParamBreath", 0.42], ["ParamBodyAngleY", 0.28]]);
  fold("ParamEyeCircles", [["ParamEyeLOpen", -0.08], ["ParamEyeROpen", -0.08], ["ParamBrowLY", 0.08], ["ParamBrowRY", 0.08]]);
  fold("ParamPupilQuake_L1", [["ParamEyeLOpen", 0.08], ["ParamBrowLY", 0.05]]);
  fold("ParamPupilQuake_R1", [["ParamEyeROpen", 0.08], ["ParamBrowRY", 0.05]]);
  fold("ParamEyeOpenBlink_L1", [["ParamEyeLOpen", 0.08], ["ParamBrowLY", 0.04]]);
  fold("ParamEyeOpenBlink_L2", [["ParamEyeLOpen", 0.06], ["ParamBrowLY", 0.03]]);
  fold("ParamEyeOpenBlinkOF_L1", [["ParamEyeLOpen", 0.06]]);
  fold("ParamEyeOpenBlinkOF_L2", [["ParamEyeLOpen", 0.04]]);
  fold("ParamCryDown_L", [["ParamBrowLY", 0.1], ["ParamBrowRY", 0.1], ["ParamMouthForm", -0.08]]);
  fold("ParamTearDown_1", [["ParamExpression_1", 0.32], ["ParamCheek", 0.08]]);
  fold("ParamTearDown_2", [["ParamExpression_1", 0.24], ["ParamCheek", 0.06]]);
  fold("ParamTearDown_3", [["ParamExpression_1", 0.18], ["ParamCheek", 0.04]]);
  fold("fire", [["ParamBrowLY", -0.12], ["ParamBrowRY", -0.12], ["ParamBodyAngleX", 0.18]]);

  if (!has("ParamMouthForm") && typeof next.ParamMouthForm === "number") {
    const form = next.ParamMouthForm;
    add("ParamMouthOpenY", form > 0 ? form * 0.2 : Math.abs(form) * 0.08);
    add("ParamEyeLOpen", form > 0 ? -form * 0.06 : -Math.abs(form) * 0.04);
    add("ParamEyeROpen", form > 0 ? -form * 0.06 : -Math.abs(form) * 0.04);
    add("ParamBrowLY", form < 0 ? Math.abs(form) * 0.12 : 0);
    add("ParamBrowRY", form < 0 ? Math.abs(form) * 0.12 : 0);
    delete next.ParamMouthForm;
  }

  if (!has("ParamMouthOpenY") && typeof next.ParamMouthOpenY === "number") {
    const open = next.ParamMouthOpenY;
    add("ParamJawOpen", open * 0.72);
    add("ParamMouthForm", open > 0.35 ? -open * 0.08 : open * 0.06);
    delete next.ParamMouthOpenY;
  }

  if (!has("ParamCheek") && typeof next.ParamCheek === "number") {
    const cheek = next.ParamCheek;
    add("ParamEyeLOpen", -cheek * 0.08);
    add("ParamEyeROpen", -cheek * 0.08);
    add("ParamMouthForm", cheek * 0.12);
    delete next.ParamCheek;
  }

  if (!has("ParamEyeLOpen") && has("ParamEyeROpen") && typeof next.ParamEyeLOpen === "number") {
    add("ParamEyeROpen", next.ParamEyeLOpen - (next.ParamEyeROpen ?? 1));
    delete next.ParamEyeLOpen;
  }
  if (!has("ParamEyeROpen") && has("ParamEyeLOpen") && typeof next.ParamEyeROpen === "number") {
    add("ParamEyeLOpen", next.ParamEyeROpen - (next.ParamEyeLOpen ?? 1));
    delete next.ParamEyeROpen;
  }
  if (!has("ParamBrowLY") && has("ParamBrowRY") && typeof next.ParamBrowLY === "number") {
    add("ParamBrowRY", next.ParamBrowLY - (next.ParamBrowRY ?? 0));
    delete next.ParamBrowLY;
  }
  if (!has("ParamBrowRY") && has("ParamBrowLY") && typeof next.ParamBrowRY === "number") {
    add("ParamBrowLY", next.ParamBrowRY - (next.ParamBrowLY ?? 0));
    delete next.ParamBrowRY;
  }

  for (const id of Object.keys(next)) {
    if (!supported.has(id)) delete next[id];
  }
  return next;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
