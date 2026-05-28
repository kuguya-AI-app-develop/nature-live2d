import type { NormalizedEmotionIntent, SpecialExpressionName } from "./types.js";

export const EXPRESSION_LAYER_PRESETS: Record<string, Record<string, number>> = {
  none: {
    ParamExpression_1: 0,
    ParamExpression_2: 0,
    ParamExpression_3: 0,
    ParamExpression_4: 0,
    ParamHide_EyesL1: 0,
    ParamHighLightHide_EyesL1: 0,
    ParamHide_EyeSocket: 0,
    ParamHide_EyeSocket2: 0,
  },
  tears: {
    ParamExpression_1: 1,
    ParamExpression_2: 0,
    ParamExpression_3: 0,
    ParamExpression_4: 0,
    ParamHide_EyesL1: 0,
    ParamHighLightHide_EyesL1: 0,
    ParamHide_EyeSocket: 0,
    ParamHide_EyeSocket2: 0,
  },
  tear_drop: {
    ParamExpression_1: 0,
    ParamExpression_2: 1,
    ParamExpression_3: 0,
    ParamExpression_4: 0,
    ParamHide_EyesL1: 1,
    ParamHighLightHide_EyesL1: 1,
    ParamHide_EyeSocket: 1,
    ParamHide_EyeSocket2: 1,
  },
  closed_eye_smile: {
    ParamExpression_1: 0,
    ParamExpression_2: 0,
    ParamExpression_3: 1,
    ParamExpression_4: 0,
    ParamHide_EyesL1: 1,
    ParamHighLightHide_EyesL1: 1,
    ParamHide_EyeSocket: 1,
    ParamHide_EyeSocket2: 1,
  },
  squeezed_eyes: {
    ParamExpression_1: 0,
    ParamExpression_2: 0,
    ParamExpression_3: 0,
    ParamExpression_4: 1,
    ParamHide_EyesL1: 1,
    ParamHighLightHide_EyesL1: 1,
    ParamHide_EyeSocket: 1,
    ParamHide_EyeSocket2: 1,
  },
};

export function resolveSpecialExpression(intent: NormalizedEmotionIntent): SpecialExpressionName {
  if (intent.specialExpression && intent.specialExpression !== "none") {
    return intent.specialExpression;
  }
  if (intent.emotion === "crying" && intent.intensity >= 0.5) return "tears";
  if (
    (intent.emotion === "happy" || intent.emotion === "teasing") &&
    intent.intensity >= 0.8 &&
    intent.eyes === "closed_smile"
  ) {
    return "closed_eye_smile";
  }
  if (intent.emotion === "panic" && intent.intensity >= 0.7) return "squeezed_eyes";
  return "none";
}

export function applySpecialExpression(
  params: Record<string, number>,
  specialExpression: string,
): Record<string, number> {
  return {
    ...params,
    ...(EXPRESSION_LAYER_PRESETS[specialExpression] ?? EXPRESSION_LAYER_PRESETS.none),
  };
}

