export type EmotionName =
  | "neutral"
  | "happy"
  | "shy"
  | "embarrassed"
  | "angry"
  | "sad"
  | "crying"
  | "surprised"
  | "confused"
  | "teasing"
  | "sleepy"
  | "panic";

export type SpecialExpressionName =
  | "none"
  | "tears"
  | "tear_drop"
  | "closed_eye_smile"
  | "squeezed_eyes";

export interface EmotionIntent {
  emotion: EmotionName;
  intensity?: number;
  gaze?: string | null;
  head?: string | null;
  eyes?: string | null;
  brows?: string | null;
  mouth?: string | null;
  specialExpression?: SpecialExpressionName | null;
  durationMs?: number;
}

export interface NormalizedEmotionIntent {
  emotion: EmotionName;
  intensity: number;
  gaze: string | null;
  head: string | null;
  eyes: string | null;
  brows: string | null;
  mouth: string | null;
  specialExpression: SpecialExpressionName | null;
  durationMs: number;
}

export interface ParameterRange {
  id: string;
  min: number;
  max: number;
  default?: number | null;
  source: string;
  rawMin?: number | null;
  rawMax?: number | null;
}

export interface ParameterMeta {
  id: string;
  name?: string | null;
  group?: string | null;
  category?: string | null;
  description?: string | null;
}

export interface ParameterProfile {
  id: string;
  range?: ParameterRange | null;
  meta?: ParameterMeta | null;
  role: string;
  controllable: boolean;
  downstream: boolean;
}

export interface Live2DResourceSet {
  root: string;
  source: "file" | "url";
  model3?: string | null;
  cdi3?: string | null;
  physics3?: string | null;
  vtube?: string | null;
  exp3: string[];
  ignored: string[];
}

export interface Live2DResourceUrls {
  rootUrl: string;
  model3Path?: string;
  cdi3Path?: string;
  physics3Path?: string;
  vtubePath?: string;
  exp3Paths?: string[];
  ignoredPaths?: string[];
}

export interface CharacterProfile {
  characterId: string;
  characterName: string;
  resources: Live2DResourceSet;
  parameters: Record<string, ParameterProfile>;
  mainControls: string[];
  expressionPresets: Record<string, Record<string, number>>;
  unsafePatterns: string[];
}

export interface ExpressionResult {
  emotion: EmotionName;
  intensity: number;
  durationMs: number;
  params: Record<string, number>;
  sourceIntent: NormalizedEmotionIntent;
  warnings: string[];
}

export type TimelinePhaseName =
  | "neutral"
  | "thinking"
  | "anticipation"
  | "reaction"
  | "settle";

export interface TimelineKeyframe {
  t: number;
  params: Record<string, number>;
  phase?: TimelinePhaseName;
}

export interface TimelineExpressionResult {
  emotion: EmotionName;
  intensity: number;
  durationMs: number;
  keyframes: TimelineKeyframe[];
  warnings: string[];
}

export interface EmotionAnalyzer {
  analyze(text: string): EmotionIntent | Promise<EmotionIntent>;
}

export type JsonObject = Record<string, unknown>;
