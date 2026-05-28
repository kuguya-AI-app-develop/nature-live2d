import { applySpecialExpression, resolveSpecialExpression } from "./expression-layer.js";
import { normalizeIntent } from "./intent.js";
import { BASE_EMOTION_PRESETS } from "./presets.js";
import type { CharacterProfile, EmotionIntent, NormalizedEmotionIntent } from "./types.js";

export function mapIntentToParams(intentInput: EmotionIntent): Record<string, number> {
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

  applyIntentModifiers(params, intent);
  return applySpecialExpression(params, resolveSpecialExpression(intent));
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
        small_smile: { ParamMouthForm: 0.35, ParamMouthOpenY: 0.05 },
        smile: { ParamMouthForm: 0.65, ParamMouthOpenY: 0.18 },
        open: { ParamMouthOpenY: 0.8 },
        frown: { ParamMouthForm: -0.45, ParamMouthOpenY: 0.05 },
        pout: { ParamMouthPuckerWiden: -0.4, ParamMouthFunnel: 0.35 },
      },
      intent.mouth,
    ],
  ];

  for (const [mapping, key] of maps) {
    if (key && mapping[key]) Object.assign(params, mapping[key]);
  }
}

