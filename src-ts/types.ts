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

export type EmotionToneName =
  | "concerned"
  | "reassuring"
  | "relieved"
  | "proud"
  | "playful"
  | "bashful"
  | "determined"
  | "disappointed"
  | "nervous"
  | "excited"
  | "grateful"
  | "amused"
  | "skeptical"
  | "focused"
  | "apologetic"
  | "frustrated"
  | "startled";

export interface EmotionIntent {
  emotion: EmotionName;
  tone?: EmotionToneName | null;
  presetId?: string | null;
  presetLabel?: string | null;
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
  tone: EmotionToneName | null;
  presetId: string | null;
  presetLabel: string | null;
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
  sources?: string[];
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

export interface Live2DModel3Urls extends Live2DResourceUrls {
  model3Path: string;
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

export type Live2DParameterSafety = "safe" | "guarded" | "blocked" | "unknown";

export interface Live2DParameterManifestEntry {
  id: string;
  role: string;
  safety: Live2DParameterSafety;
  controllable: boolean;
  downstream: boolean;
  range?: ParameterRange | null;
  meta?: ParameterMeta | null;
  sources: string[];
  expressionPresets: string[];
  reason: string;
}

export interface Live2DParameterManifest {
  characterId: string;
  characterName: string;
  totalCount: number;
  controllableCount: number;
  safeParameterIds: string[];
  guardedParameterIds: string[];
  blockedParameterIds: string[];
  byRole: Record<string, string[]>;
  entries: Record<string, Live2DParameterManifestEntry>;
  expressionPresetNames: string[];
}

export type Live2DMotionFeature =
  | "head"
  | "body"
  | "breath"
  | "gaze"
  | "eyeOpen"
  | "eyeSmile"
  | "eyeSquint"
  | "eyeEffect"
  | "brow"
  | "mouthForm"
  | "mouthOpen"
  | "mouthShape"
  | "mouthThickness"
  | "mouthX"
  | "jaw"
  | "tongue"
  | "cheek"
  | "cheekPuff"
  | "mouthPucker"
  | "mouthFunnel"
  | "mouthPress"
  | "mouthShrug"
  | "tearEffect"
  | "emotionEffect"
  | "expressionLayer";

export interface Live2DMotionCapability {
  characterId: string;
  characterName: string;
  score: number;
  availableFeatures: Live2DMotionFeature[];
  missingCoreFeatures: Live2DMotionFeature[];
  byFeature: Record<Live2DMotionFeature, string[]>;
  roleCounts: Record<string, number>;
  safeParameterIds: string[];
  expressionPresetNames: string[];
}

export type Live2DModelInspectionSeverity = "info" | "warning";
export type Live2DModelMotionStrategy = "full" | "basic" | "manual_mapping_required";

export interface Live2DModelInspectionIssue {
  code: string;
  severity: Live2DModelInspectionSeverity;
  message: string;
  parameterIds?: string[];
}

export interface Live2DModelInspectionReport {
  characterId: string;
  characterName: string;
  resources: Live2DResourceSet;
  profile: CharacterProfile;
  manifest: Live2DParameterManifest;
  capability: Live2DMotionCapability;
  strategy: Live2DModelMotionStrategy;
  defaultMotionUsable: boolean;
  issues: Live2DModelInspectionIssue[];
  recommendations: string[];
}

export interface ExpressionResult {
  emotion: EmotionName;
  tone?: EmotionToneName | null;
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
  tone?: EmotionToneName | null;
  intensity: number;
  durationMs: number;
  keyframes: TimelineKeyframe[];
  warnings: string[];
}

export interface EmotionAnalyzer {
  analyze(text: string): EmotionIntent | Promise<EmotionIntent>;
}

export interface EmotionStreamAnalyzerEvent {
  intent: EmotionIntent;
  summary?: string;
}

export interface EmotionStreamAnalyzer {
  stream(text: string): AsyncIterable<EmotionIntent | EmotionStreamAnalyzerEvent>;
}

export type JsonObject = Record<string, unknown>;
