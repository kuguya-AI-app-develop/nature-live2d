import { applySpecialExpression, resolveSpecialExpression } from "./expression-layer.js";
import { normalizeIntent } from "./intent.js";
import { BASE_EMOTION_PRESETS } from "./presets.js";
import type { CharacterProfile, EmotionIntent, EmotionToneName, NormalizedEmotionIntent } from "./types.js";

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
  applyIntentModifiers(params, intent);
  const withExpression = applySpecialExpression(params, resolveSpecialExpression(intent));
  return profile ? adaptParamsToProfile(withExpression, profile) : withExpression;
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

const TONE_LAYER_PRESETS: Record<EmotionToneName, Record<string, number>> = {
  concerned: {
    ParamEyeLOpen: 0.95,
    ParamEyeROpen: 0.95,
    ParamEyeLSquint: 0.08,
    ParamEyeRSquint: 0.08,
    ParamEyeBallY: -0.08,
    ParamBrowLY: 0.48,
    ParamBrowRY: 0.48,
    ParamMouthForm: -0.18,
    ParamMouthOpenY: 0.08,
    ParamAngleY: -1.2,
    ParamBodyAngleX: -0.35,
    ParamTearDown_1: 0.14,
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
  },
  relieved: {
    ParamEyeLOpen: 0.76,
    ParamEyeROpen: 0.76,
    ParamEyeSmile_Happy_L: 0.26,
    ParamEyeSmile_Happy_R: 0.26,
    ParamBrowLY: 0.08,
    ParamBrowRY: 0.08,
    ParamMouthForm: 0.68,
    ParamMouthOpenY: 0.22,
    ParamMouthShape: 0.18,
    ParamCheek: 0.34,
    ParamAngleY: 1.55,
    ParamBodyAngleY: 0.85,
    ParamBreath: 0.66,
    ParamBreathPhysics_L: 0.32,
  },
  proud: {
    ParamEyeLOpen: 0.88,
    ParamEyeROpen: 0.88,
    ParamEyeSmile_Happy_L: 0.44,
    ParamEyeSmile_Happy_R: 0.44,
    ParamMouthForm: 0.86,
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
  determined: {
    ParamEyeLOpen: 1.1,
    ParamEyeROpen: 1.1,
    ParamEyeSmile_Angry_L: 0.24,
    ParamEyeSmile_Angry_R: 0.24,
    ParamBrowLY: -0.34,
    ParamBrowRY: -0.34,
    ParamMouthForm: 0.04,
    ParamMouthOpenY: 0.04,
    ParamMouthStraight: 0.18,
    ParamMouthPressLipOpen: -0.44,
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
  grateful: {
    ParamEyeLOpen: 0.78,
    ParamEyeROpen: 0.78,
    ParamEyeSmile_Happy_L: 0.36,
    ParamEyeSmile_Happy_R: 0.36,
    ParamEyeBallY: -0.12,
    ParamBrowLY: 0.18,
    ParamBrowRY: 0.18,
    ParamMouthForm: 0.68,
    ParamMouthOpenY: 0.18,
    ParamMouthShape: 0.16,
    ParamCheek: 0.5,
    ParamAngleY: -1.3,
    ParamBodyAngleX: 0.95,
    ParamBreathPhysics_L: 0.24,
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
    ParamEyeLOpen: 1.08,
    ParamEyeROpen: 1.08,
    ParamEyeSmile_Angry_L: 0.18,
    ParamEyeSmile_Angry_R: 0.18,
    ParamBrowLY: -0.18,
    ParamBrowRY: -0.18,
    ParamMouthForm: 0.08,
    ParamMouthOpenY: 0.06,
    ParamMouthPressLipOpen: -0.3,
    ParamMouthStraight: 0.16,
    ParamAngleY: 1.9,
    ParamBodyAngleX: 1.3,
    ParamBreath: 0.62,
    ParamBreathPhysics_L: 0.28,
  },
  apologetic: {
    ParamEyeLOpen: 0.66,
    ParamEyeROpen: 0.66,
    ParamEyeBallY: -0.3,
    ParamBrowLY: 0.38,
    ParamBrowRY: 0.38,
    ParamMouthForm: -0.1,
    ParamMouthOpenY: 0.08,
    ParamMouthStraight: 0.16,
    ParamCheek: 0.34,
    ParamAngleY: -4.5,
    ParamAngleZ: 1.8,
    ParamBodyAngleX: -1.1,
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
