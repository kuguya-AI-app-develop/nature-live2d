export const YACHIYO_MAIN_CONTROLS = [
  "ParamAngleX",
  "ParamAngleY",
  "ParamAngleZ",
  "ParamBodyAngleX",
  "ParamBodyAngleY",
  "ParamBodyAngleZ",
  "ParamBreath",
  "ParamCheek",
  "ParamBrowLY",
  "ParamBrowRY",
  "ParamEyeLOpen",
  "ParamEyeROpen",
  "ParamEyeBallX",
  "ParamEyeBallY",
  "ParamMouthForm",
  "ParamMouthOpenY",
  "ParamMouthX",
  "ParamTongueOut",
  "ParamJawOpen",
  "ParamMouthPuckerWiden",
  "ParamCheekPuff",
  "ParamMouthFunnel",
  "ParamMouthPressLipOpen",
  "ParamMouthShrug",
  "ParamExpression_1",
  "ParamExpression_2",
  "ParamExpression_3",
  "ParamExpression_4",
  "ParamHide_EyesL1",
  "ParamHighLightHide_EyesL1",
  "ParamHide_EyeSocket",
  "ParamHide_EyeSocket2",
] as const;

export const YACHIYO_FALLBACK_RANGES: Record<string, [number, number]> = {
  ParamExpression_1: [0, 1],
  ParamExpression_2: [0, 1],
  ParamExpression_3: [0, 1],
  ParamExpression_4: [0, 1],
  ParamHide_EyesL1: [0, 1],
  ParamHighLightHide_EyesL1: [0, 1],
  ParamHide_EyeSocket: [0, 1],
  ParamHide_EyeSocket2: [0, 1],
};

export const YACHIYO_RANGE_OVERRIDES: Record<string, [number, number]> = {
  ParamCheek: [0, 1],
};

export const YACHIYO_UNSAFE_PATTERNS = [
  "Physics",
  "HairPhysics",
  "DressPhysics",
  "SkirtPhysics",
  "SleevePhysics",
  "RibbonPhysics",
  "HighlightPhysics",
];

