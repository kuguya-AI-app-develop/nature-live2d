import type {
  EmotionName,
  EmotionIntent,
  EmotionToneName,
  Live2DMotionFeature,
} from "./types.js";

export type RealtimeMotionLayerPhase = "thinking" | "streaming" | "reacting" | "calibrating" | "settling";
export type RealtimeMotionLayerSource = "idle" | "local" | "semantic" | "sustain";

export interface RealtimeMotionLayerState {
  face: number;
  speech: number;
  gaze: number;
  pose: number;
  breath: number;
  accent: number;
  mask: number;
}

export interface RealtimeMotionLayerContext {
  intent: EmotionIntent;
  phase: RealtimeMotionLayerPhase;
  source: RealtimeMotionLayerSource;
  elapsedMs: number;
  transitionElapsedMs: number;
  speechEnergy: number;
  lastAssistantDeltaAgeMs: number;
  expressiveness: number;
  stability: number;
  hasParam: (id: string) => boolean;
  hasFeature: (feature: Live2DMotionFeature) => boolean;
}

export interface RealtimeMotionLayerResult {
  params: Record<string, number>;
  layers: RealtimeMotionLayerState;
}

export function createRealtimeMotionLayerState(): RealtimeMotionLayerState {
  return {
    face: 0,
    speech: 0,
    gaze: 0,
    pose: 0,
    breath: 0,
    accent: 0,
    mask: 0,
  };
}

export function applyRealtimeMotionLayers(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
): RealtimeMotionLayerResult {
  const next = { ...params };
  const layers = createRealtimeMotionLayerState();
  const intent = context.intent;
  const intensity = clamp(intent.intensity ?? 0.18, 0, 1);
  const expressiveness = clamp(context.expressiveness, 0.5, 2.6);
  const stability = clamp(context.stability, 0, 1);
  const expressivenessScale = clamp(0.82 + expressiveness * 0.4, 0.94, 1.86);
  const stabilityDamping = lerp(1.12, 0.72, stability);
  const phaseWeight = phaseLayerWeight(context.phase);
  const emotionWeight = emotionLayerWeight(intent.emotion, intent.tone ?? null);
  const faceWeight = clamp(
    intensity * phaseWeight * emotionWeight * expressivenessScale * stabilityDamping,
    0,
    1.65,
  );
  const elapsed = Math.max(0, context.elapsedMs);

  layers.face = faceWeight;
  applyFacialLayer(next, context, faceWeight, elapsed);

  const accentWeight = transitionAccentLayer(context.transitionElapsedMs)
    * clamp(0.74 + expressiveness * 0.22, 0.76, 1.28)
    * emotionWeight
    * (context.source === "semantic" ? 1.08 : context.source === "local" ? 0.92 : 0.78);
  if (accentWeight > 0.001) {
    layers.accent = clamp(accentWeight, 0, 1.7);
    applyAccentLayer(next, context, layers.accent);
  }

  const recentSpeech = Number.isFinite(context.lastAssistantDeltaAgeMs)
    ? Math.exp(-Math.max(0, context.lastAssistantDeltaAgeMs) / 760)
    : 0;
  const speechPhase = context.phase === "thinking" || context.phase === "settling" ? 0.36 : 1;
  const speechWeight = clamp(
    context.speechEnergy * recentSpeech * speechPhase * clamp(0.86 + expressiveness * 0.32, 0.94, 1.64),
    0,
    1.35,
  );
  if (speechWeight > 0.001) {
    layers.speech = speechWeight;
    applySpeechLayer(next, context, speechWeight, elapsed);
  }

  const gazeWeight = context.hasFeature("gaze")
    ? clamp(faceWeight * (context.phase === "settling" ? 0.38 : 0.72), 0, 1.15)
    : 0;
  if (gazeWeight > 0.001) {
    layers.gaze = gazeWeight;
    applyAttentionLayer(next, context, gazeWeight, elapsed);
  }

  return { params: next, layers };
}

function applyFacialLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const { emotion, tone } = context.intent;
  const slow = Math.sin(elapsedMs * 0.0042 + emotionPhase(emotion));
  const pulse = Math.sin(elapsedMs * 0.0074 + emotionPhase(emotion) * 0.6);
  const softPulse = Math.max(0, slow) * amount;

  switch (tone ?? emotion) {
    case "excited":
    case "happy":
      add(params, context, "ParamEyeSmile_Happy_L", 0.1 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.1 * softPulse);
      add(params, context, "ParamCheek", 0.12 * softPulse);
      add(params, context, "ParamMouthOpenY", 0.08 * softPulse);
      add(params, context, "ParamMouthShape", 0.05 * softPulse);
      add(params, context, "ParamEyeOpenBlink_L1", 0.06 * softPulse);
      add(params, context, "ParamBreathPhysics_L", 0.08 * softPulse);
      break;
    case "proud":
    case "grateful":
    case "relieved":
      add(params, context, "ParamEyeSmile_Happy_L", 0.07 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.07 * softPulse);
      add(params, context, "ParamCheek", 0.08 * softPulse);
      add(params, context, "ParamMouthForm", 0.04 * softPulse);
      break;
    case "playful":
    case "amused":
    case "teasing":
      add(params, context, "ParamEyeLSquint", 0.09 * softPulse);
      add(params, context, "ParamMouthX", 0.08 * pulse * amount);
      add(params, context, "ParamCheek", 0.06 * softPulse);
      break;
    case "bashful":
    case "shy":
    case "embarrassed":
      add(params, context, "ParamCheek", 0.14 * softPulse);
      add(params, context, "ParamCheekPuff2", 0.08 * softPulse);
      add(params, context, "ParamEyeBallY", -0.025 * softPulse);
      add(params, context, "ParamMouthForm", 0.035 * softPulse);
      break;
    case "nervous":
    case "panic":
    case "startled":
    case "surprised":
      add(params, context, "ParamEyeLOpen", 0.08 * softPulse);
      add(params, context, "ParamEyeROpen", 0.08 * softPulse);
      add(params, context, "ParamBrowLY", 0.075 * softPulse);
      add(params, context, "ParamBrowRY", 0.075 * softPulse);
      add(params, context, "ParamMouthOpenY", 0.08 * Math.max(0, pulse) * amount);
      add(params, context, "ParamPupilQuake_L1", 0.16 * softPulse);
      add(params, context, "ParamPupilQuake_R1", 0.16 * softPulse);
      add(params, context, "ParamBreathPhysics_L", 0.12 * softPulse);
      break;
    case "focused":
    case "determined":
    case "frustrated":
    case "angry":
      add(params, context, "ParamEyeSmile_Angry_L", 0.08 * softPulse);
      add(params, context, "ParamEyeSmile_Angry_R", 0.08 * softPulse);
      add(params, context, "ParamBrowLY", -0.07 * softPulse);
      add(params, context, "ParamBrowRY", -0.07 * softPulse);
      add(params, context, "ParamMouthStraight", 0.06 * softPulse);
      add(params, context, "fire", 0.1 * softPulse);
      break;
    case "skeptical":
    case "confused":
      add(params, context, "ParamEyeLSquint", 0.09 * softPulse);
      add(params, context, "ParamBrowRY", 0.07 * softPulse);
      add(params, context, "ParamMouthX", -0.06 * softPulse);
      add(params, context, "ParamEyeCircles", 0.08 * softPulse);
      break;
    case "reassuring":
    case "concerned":
    case "sad":
    case "crying":
    case "disappointed":
    case "apologetic":
      add(params, context, "ParamEyeLOpen", -0.035 * softPulse);
      add(params, context, "ParamEyeROpen", -0.035 * softPulse);
      add(params, context, "ParamBrowLY", 0.055 * softPulse);
      add(params, context, "ParamBrowRY", 0.055 * softPulse);
      add(params, context, "ParamMouthShrug", 0.035 * softPulse);
      add(params, context, "ParamTearDown_1", 0.06 * softPulse);
      break;
    case "sleepy":
      add(params, context, "ParamEyeLOpen", -0.06 * softPulse);
      add(params, context, "ParamEyeROpen", -0.06 * softPulse);
      add(params, context, "ParamMouthFunnel", 0.035 * softPulse);
      add(params, context, "ParamEyeCircles", 0.04 * softPulse);
      break;
    default:
      break;
  }
}

function applyAccentLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
): void {
  const { emotion, tone } = context.intent;
  switch (tone ?? emotion) {
    case "excited":
    case "happy":
      add(params, context, "ParamMouthOpenY", 0.16 * amount);
      add(params, context, "ParamJawOpen", 0.08 * amount);
      add(params, context, "ParamCheek", 0.14 * amount);
      add(params, context, "ParamBodyAngleY", 1.05 * amount);
      add(params, context, "ParamAngleY", 0.7 * amount);
      add(params, context, "ParamEyeOpenBlink_L1", 0.18 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.18 * amount);
      break;
    case "playful":
    case "amused":
    case "teasing":
      add(params, context, "ParamMouthX", 0.18 * amount);
      add(params, context, "ParamEyeLSquint", 0.12 * amount);
      add(params, context, "ParamAngleZ", -1.2 * amount);
      break;
    case "bashful":
    case "shy":
    case "embarrassed":
      add(params, context, "ParamCheek", 0.2 * amount);
      add(params, context, "ParamEyeBallY", -0.08 * amount);
      add(params, context, "ParamAngleY", -1.0 * amount);
      break;
    case "startled":
    case "surprised":
    case "panic":
    case "nervous":
      add(params, context, "ParamEyeLOpen", 0.18 * amount);
      add(params, context, "ParamEyeROpen", 0.18 * amount);
      add(params, context, "ParamBrowLY", 0.16 * amount);
      add(params, context, "ParamBrowRY", 0.16 * amount);
      add(params, context, "ParamMouthOpenY", 0.2 * amount);
      add(params, context, "ParamJawOpen", 0.12 * amount);
      add(params, context, "ParamBodyAngleX", -1.4 * amount);
      add(params, context, "ParamPupilQuake_L1", 0.34 * amount);
      add(params, context, "ParamPupilQuake_R1", 0.34 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.26 * amount);
      break;
    case "focused":
    case "determined":
    case "frustrated":
    case "angry":
      add(params, context, "ParamBrowLY", -0.14 * amount);
      add(params, context, "ParamBrowRY", -0.14 * amount);
      add(params, context, "ParamEyeSmile_Angry_L", 0.14 * amount);
      add(params, context, "ParamEyeSmile_Angry_R", 0.14 * amount);
      add(params, context, "ParamBodyAngleX", 0.9 * amount);
      add(params, context, "fire", 0.24 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.2 * amount);
      break;
    case "skeptical":
    case "confused":
      add(params, context, "ParamEyeLSquint", 0.14 * amount);
      add(params, context, "ParamMouthX", -0.14 * amount);
      add(params, context, "ParamAngleZ", -1.1 * amount);
      break;
    case "reassuring":
    case "grateful":
    case "relieved":
      add(params, context, "ParamMouthForm", 0.08 * amount);
      add(params, context, "ParamEyeSmile_Happy_L", 0.1 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", 0.1 * amount);
      add(params, context, "ParamBodyAngleX", 0.65 * amount);
      break;
    case "sad":
    case "crying":
    case "disappointed":
    case "apologetic":
    case "concerned":
      add(params, context, "ParamBrowLY", 0.12 * amount);
      add(params, context, "ParamBrowRY", 0.12 * amount);
      add(params, context, "ParamEyeBallY", -0.06 * amount);
      add(params, context, "ParamBodyAngleX", -0.7 * amount);
      add(params, context, "ParamTearDown_1", 0.14 * amount);
      break;
    default:
      break;
  }
}

function applySpeechLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const phoneme = 0.5 + Math.sin(elapsedMs * 0.043 + Math.sin(elapsedMs * 0.006) * 1.35) * 0.5;
  const vowel = 0.5 + Math.sin(elapsedMs * 0.027 + 1.1) * 0.5;
  const smileBias = context.intent.emotion === "happy" || context.intent.emotion === "teasing" ? 0.04 : 0;
  const sadBias = context.intent.emotion === "sad" || context.intent.emotion === "crying" ? -0.035 : 0;
  add(params, context, "ParamMouthOpenY", (0.09 + phoneme * 0.16) * amount);
  add(params, context, "ParamJawOpen", phoneme * 0.08 * amount);
  add(params, context, "ParamMouthShape", vowel * 0.065 * amount);
  add(params, context, "ParamMouthThickness", Math.sin(elapsedMs * 0.031) * 0.035 * amount);
  add(params, context, "ParamMouthForm", (smileBias + sadBias + Math.sin(elapsedMs * 0.019) * 0.025) * amount);
}

function applyAttentionLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const scan = Math.sin(elapsedMs * 0.0019 + emotionPhase(context.intent.emotion));
  const lift = Math.sin(elapsedMs * 0.0013 + 0.7);
  const toneLeftBias = context.intent.tone === "skeptical" || context.intent.emotion === "confused" ? -0.045 : 0;
  const toneRightBias = context.intent.tone === "playful" || context.intent.tone === "amused" ? 0.04 : 0;
  add(params, context, "ParamEyeBallX", (scan * 0.045 + toneLeftBias + toneRightBias) * amount);
  add(params, context, "ParamEyeBallY", lift * 0.026 * amount);
  add(params, context, "ParamAngleX", scan * 0.45 * amount);
  add(params, context, "ParamAngleY", lift * 0.38 * amount);
}

function add(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  id: string,
  value: number,
): void {
  if (!value || !Number.isFinite(value) || !context.hasParam(id)) return;
  if (id.startsWith("ParamBodyAngle") && !context.hasFeature("body")) return;
  if (/^ParamAngle[XYZ]$/.test(id) && !context.hasFeature("head")) return;
  if (id.startsWith("ParamEyeBall") && !context.hasFeature("gaze")) return;
  params[id] = (params[id] ?? 0) + value;
}

function phaseLayerWeight(phase: RealtimeMotionLayerPhase): number {
  switch (phase) {
    case "thinking":
      return 0.68;
    case "streaming":
      return 0.92;
    case "reacting":
      return 1.08;
    case "calibrating":
      return 0.98;
    case "settling":
      return 0.62;
    default:
      return 0.72;
  }
}

function emotionLayerWeight(emotion: EmotionName, tone: EmotionToneName | null): number {
  switch (tone) {
    case "excited":
    case "startled":
    case "frustrated":
      return 1.22;
    case "playful":
    case "amused":
    case "nervous":
      return 1.14;
    case "focused":
    case "skeptical":
    case "proud":
      return 1.08;
    case "reassuring":
    case "concerned":
      return 0.82;
    default:
      break;
  }
  switch (emotion) {
    case "panic":
    case "surprised":
      return 1.18;
    case "happy":
    case "teasing":
      return 1.08;
    case "sleepy":
      return 0.58;
    case "neutral":
      return 0.35;
    default:
      return 1;
  }
}

function transitionAccentLayer(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 680) return 0;
  const progress = clamp(elapsedMs / 680, 0, 1);
  return Math.sin(progress * Math.PI) * (1 - progress * 0.18);
}

function emotionPhase(emotion: EmotionName): number {
  switch (emotion) {
    case "happy":
      return 0.2;
    case "shy":
    case "embarrassed":
      return 1.1;
    case "sad":
    case "crying":
      return 1.8;
    case "surprised":
    case "panic":
      return 2.5;
    case "confused":
      return 3.2;
    case "teasing":
      return 3.9;
    case "angry":
      return 4.4;
    case "sleepy":
      return 5.1;
    default:
      return 0.7;
  }
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
