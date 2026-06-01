import type {
  EmotionName,
  EmotionIntent,
  EmotionToneName,
  Live2DMotionFeature,
  MotionPerformanceStyleName,
} from "./types.js";
import { resolveMotionPerformanceStyle } from "./motion-style.js";

export type RealtimeMotionLayerPhase = "thinking" | "streaming" | "reacting" | "calibrating" | "settling";
export type RealtimeMotionLayerSource = "idle" | "local" | "semantic" | "sustain";

export interface RealtimeMotionLayerState {
  face: number;
  facialBeat: number;
  speech: number;
  gaze: number;
  pose: number;
  breath: number;
  accent: number;
  performance: number;
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
    facialBeat: 0,
    speech: 0,
    gaze: 0,
    pose: 0,
    breath: 0,
    accent: 0,
    performance: 0,
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
  const motionStyle = resolveMotionPerformanceStyle(intent);
  const intensity = clamp(intent.intensity ?? 0.18, 0, 1);
  const expressiveness = clamp(context.expressiveness, 0.5, 3.2);
  const stability = clamp(context.stability, 0, 1);
  const expressivenessScale = clamp(0.9 + expressiveness * 0.46, 0.98, 2.55);
  const stabilityDamping = lerp(1.12, 0.72, stability);
  const phaseWeight = phaseLayerWeight(context.phase);
  const emotionWeight = emotionLayerWeight(intent.emotion, intent.tone ?? null);
  const faceWeight = clamp(
    intensity * phaseWeight * emotionWeight * expressivenessScale * stabilityDamping,
    0,
    2.15,
  );
  const elapsed = Math.max(0, context.elapsedMs);

  layers.face = faceWeight;
  if (motionStyle !== "still") {
    applyFacialLayer(next, context, faceWeight, elapsed);
  }
  const facialBeatWeight = motionStyle !== "still"
    ? clamp(faceWeight * clamp(0.48 + expressiveness * 0.16, 0.58, 0.98), 0, 1.72)
    : 0;
  if (facialBeatWeight > 0.001) {
    const facialBeatActivity = applyFacialBeatLayer(next, context, facialBeatWeight, elapsed);
    layers.facialBeat = facialBeatWeight * facialBeatActivity;
  }
  const readabilityWeight = clamp(
    faceWeight * clamp(0.42 + expressiveness * 0.14, 0.48, 0.88),
    0,
    1.42,
  );
  if (readabilityWeight > 0.001) {
    applyReadabilityHoldLayer(next, context, readabilityWeight);
    applyMouthAngleDetailLayer(next, context, readabilityWeight);
  }
  const onsetWeight = transitionReadabilityOnsetLayer(context.transitionElapsedMs)
    * clamp(faceWeight * (0.78 + expressiveness * 0.09), 0, 1.18);
  if (onsetWeight > 0.001) {
    applyReadabilityOnsetLayer(next, context, onsetWeight);
  }

  const accentWeight = transitionAccentLayer(context.transitionElapsedMs)
    * clamp(0.84 + expressiveness * 0.24, 0.86, 1.62)
    * emotionWeight
    * (motionStyle === "still" ? 0.22 : 1)
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
    context.speechEnergy * recentSpeech * speechPhase * clamp(0.86 + expressiveness * 0.32, 0.94, 1.78),
    0,
    1.35,
  );
  if (speechWeight > 0.001) {
    layers.speech = speechWeight;
    applySpeechLayer(next, context, speechWeight, elapsed);
  }

  const gazeWeight = context.hasFeature("gaze")
    ? clamp(faceWeight * (context.phase === "settling" ? 0.38 : 0.72) * (motionStyle === "still" ? 0.12 : 1), 0, 1.15)
    : 0;
  if (gazeWeight > 0.001) {
    layers.gaze = gazeWeight;
    applyAttentionLayer(next, context, gazeWeight, elapsed);
  }

  const poseWeight = context.hasFeature("body") || context.hasFeature("head")
    ? clamp(faceWeight * clamp(0.76 + expressiveness * 0.24, 0.9, 1.52) * (motionStyle === "still" ? 0 : 1), 0, 1.72)
    : 0;
  if (poseWeight > 0.001) {
    layers.pose = poseWeight;
    applyPoseLayer(next, context, poseWeight, elapsed);
  }

  const performanceWeight = motionStyle && motionStyle !== "still"
    ? clamp(faceWeight * clamp(0.72 + expressiveness * 0.22, 0.84, 1.42), 0, 1.9)
    : 0;
  if (motionStyle && performanceWeight > 0.001) {
    layers.performance = performanceWeight;
    applyMotionStyleLayer(next, context, motionStyle, performanceWeight, elapsed);
  }

  const breathWeight = context.hasFeature("breath")
    ? clamp((0.3 + intensity * 0.82) * phaseWeight * expressivenessScale * (1.08 - stability * 0.28) * (motionStyle === "still" ? 0.24 : 1), 0, 1.55)
    : 0;
  if (breathWeight > 0.001) {
    layers.breath = breathWeight;
    applyBreathLayer(next, context, breathWeight, elapsed);
  }

  return { params: next, layers };
}

function applyFacialBeatLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): number {
  const { emotion, tone } = context.intent;
  const key = tone ?? emotion;
  const warmBloom = beatEnvelope(elapsedMs, 2860, 220, 620, 760, 120);
  const softBlink = beatEnvelope(elapsedMs, 3820, 160, 120, 440, 940);
  const glance = beatEnvelope(elapsedMs, 3340, 180, 480, 620, 420);
  const alert = beatEnvelope(elapsedMs, 2480, 100, 220, 520, 80);
  const tighten = beatEnvelope(elapsedMs, 3180, 180, 680, 740, 260);
  const tearBuild = beatEnvelope(elapsedMs, 4260, 460, 1180, 980, 340);
  const release = beatEnvelope(elapsedMs, 4260, 120, 260, 540, 2380);
  let activity = 0;

  switch (key) {
    case "excited":
    case "delighted":
    case "celebratory":
    case "happy":
      activity = warmBloom;
      add(params, context, "ParamEyeSmile_Happy_L", warmBloom * 0.14 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", warmBloom * 0.14 * amount);
      add(params, context, "ParamCheek", warmBloom * 0.16 * amount);
      add(params, context, "ParamMouthShape", warmBloom * 0.07 * amount);
      add(params, context, "ParamMouthAngleModify_YU", warmBloom * 0.12 * amount);
      add(params, context, "ParamEyeOpenBlink_L1", warmBloom * 0.11 * amount);
      add(params, context, "ParamEyeOpenBlink_L2", warmBloom * 0.07 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L1", warmBloom * 0.08 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", warmBloom * 0.055 * amount);
      break;
    case "proud":
    case "grateful":
    case "relieved":
    case "tender":
    case "reassuring":
      activity = Math.max(softBlink, warmBloom);
      add(params, context, "ParamEyeLOpen", softBlink * -0.11 * amount);
      add(params, context, "ParamEyeROpen", softBlink * -0.11 * amount);
      add(params, context, "ParamEyeSmile_Happy_L", warmBloom * 0.085 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", warmBloom * 0.085 * amount);
      add(params, context, "ParamCheek", warmBloom * 0.08 * amount);
      add(params, context, "ParamMouthAngleModify_YU", warmBloom * 0.07 * amount);
      break;
    case "bashful":
    case "flustered":
    case "shy":
    case "embarrassed":
    case "apologetic":
      activity = Math.max(glance, softBlink, warmBloom);
      add(params, context, "ParamEyeBallX", glance * -0.11 * amount);
      add(params, context, "ParamEyeBallY", glance * -0.09 * amount);
      add(params, context, "ParamEyeLOpen", softBlink * -0.12 * amount);
      add(params, context, "ParamEyeROpen", softBlink * -0.09 * amount);
      add(params, context, "ParamCheek", warmBloom * 0.18 * amount);
      add(params, context, "ParamCheekPuff", warmBloom * 0.12 * amount);
      add(params, context, "ParamCheekPuff2", warmBloom * 0.1 * amount);
      add(params, context, "ParamMouthPuckerWiden", warmBloom * -0.08 * amount);
      break;
    case "playful":
    case "amused":
    case "teasing":
      activity = glance;
      add(params, context, "ParamEyeLSquint", glance * 0.19 * amount);
      add(params, context, "ParamEyeRSquint", glance * 0.08 * amount);
      add(params, context, "ParamEyeBallX", glance * 0.1 * amount);
      add(params, context, "ParamMouthX", glance * 0.13 * amount);
      add(params, context, "ParamMouthAngleModify_XL", glance * -0.16 * amount);
      add(params, context, "ParamMouthAngleModify_XR", glance * 0.1 * amount);
      break;
    case "skeptical":
    case "confused":
      activity = Math.max(tighten, glance);
      add(params, context, "ParamEyeLSquint", tighten * 0.16 * amount);
      add(params, context, "ParamEyeRSquint", tighten * 0.06 * amount);
      add(params, context, "ParamBrowLY", tighten * -0.09 * amount);
      add(params, context, "ParamBrowRY", tighten * 0.1 * amount);
      add(params, context, "ParamEyeBallX", glance * -0.1 * amount);
      add(params, context, "ParamMouthX", tighten * -0.1 * amount);
      break;
    case "nervous":
    case "startled":
    case "panic":
    case "surprised":
      activity = alert;
      add(params, context, "ParamEyeLOpen", alert * 0.18 * amount);
      add(params, context, "ParamEyeROpen", alert * 0.18 * amount);
      add(params, context, "ParamBrowLY", alert * 0.14 * amount);
      add(params, context, "ParamBrowRY", alert * 0.14 * amount);
      add(params, context, "ParamMouthOpenY", alert * 0.16 * amount);
      add(params, context, "ParamPupilQuake_L1", alert * 0.18 * amount);
      add(params, context, "ParamPupilQuake_R1", alert * 0.18 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", alert * 0.08 * amount);
      break;
    case "focused":
    case "determined":
    case "guarded":
    case "frustrated":
    case "angry":
      activity = tighten;
      add(params, context, "ParamEyeSmile_Angry_L", tighten * 0.13 * amount);
      add(params, context, "ParamEyeSmile_Angry_R", tighten * 0.13 * amount);
      add(params, context, "ParamEyeLSquint", tighten * 0.08 * amount);
      add(params, context, "ParamBrowLY", tighten * -0.12 * amount);
      add(params, context, "ParamBrowRY", tighten * -0.12 * amount);
      add(params, context, "ParamMouthPressLipOpen", tighten * -0.11 * amount);
      add(params, context, "ParamMouthStraight", tighten * 0.1 * amount);
      add(params, context, "fire", tighten * 0.1 * amount);
      break;
    case "concerned":
    case "wistful":
    case "disappointed":
    case "sad":
    case "crying":
      activity = Math.max(softBlink, tearBuild, emotion === "crying" ? release : 0);
      add(params, context, "ParamEyeLOpen", softBlink * -0.1 * amount);
      add(params, context, "ParamEyeROpen", softBlink * -0.08 * amount);
      add(params, context, "ParamBrowLY", tearBuild * 0.12 * amount);
      add(params, context, "ParamBrowRY", tearBuild * 0.11 * amount);
      add(params, context, "ParamMouthShrug", tearBuild * 0.09 * amount);
      add(params, context, "ParamTearDown_1", tearBuild * 0.13 * amount);
      if (emotion === "crying") {
        add(params, context, "ParamCryDown_L", tearBuild * 0.2 * amount);
        add(params, context, "ParamTearDown_2", tearBuild * 0.11 * amount);
        add(params, context, "ParamTearDown_3", tearBuild * 0.07 * amount);
        add(params, context, "ParamTearDisappear_1", release * 0.22 * amount);
        add(params, context, "ParamTearDisappear_2", release * 0.14 * amount);
        add(params, context, "ParamTearDisappear_3", release * 0.09 * amount);
      }
      break;
    case "sleepy":
      activity = Math.max(softBlink, warmBloom);
      add(params, context, "ParamEyeLOpen", softBlink * -0.2 * amount);
      add(params, context, "ParamEyeROpen", softBlink * -0.2 * amount);
      add(params, context, "ParamEyeLSquint", softBlink * 0.1 * amount);
      add(params, context, "ParamEyeRSquint", softBlink * 0.1 * amount);
      add(params, context, "ParamMouthFunnel", warmBloom * 0.06 * amount);
      break;
    default:
      break;
  }
  return activity;
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
    case "delighted":
    case "celebratory":
    case "happy":
      add(params, context, "ParamEyeSmile_Happy_L", 0.1 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.1 * softPulse);
      add(params, context, "ParamCheek", 0.12 * softPulse);
      add(params, context, "ParamCheekPuff", 0.045 * softPulse);
      add(params, context, "ParamMouthOpenY", 0.08 * softPulse);
      add(params, context, "ParamMouthShape", 0.05 * softPulse);
      add(params, context, "ParamEyeOpenBlink_L1", 0.06 * softPulse);
      add(params, context, "ParamEyeOpenBlink_L2", 0.04 * softPulse);
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.045 * softPulse);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.03 * softPulse);
      add(params, context, "ParamBreathPhysics_L", 0.08 * softPulse);
      break;
    case "proud":
    case "grateful":
    case "relieved":
    case "tender":
      add(params, context, "ParamEyeSmile_Happy_L", 0.07 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.07 * softPulse);
      add(params, context, "ParamCheek", 0.08 * softPulse);
      add(params, context, "ParamMouthForm", 0.04 * softPulse);
      add(params, context, "ParamMouthShape", 0.025 * softPulse);
      break;
    case "playful":
    case "amused":
    case "teasing":
      add(params, context, "ParamEyeLSquint", 0.09 * softPulse);
      add(params, context, "ParamEyeRSquint", 0.045 * softPulse);
      add(params, context, "ParamMouthX", 0.08 * pulse * amount);
      add(params, context, "ParamCheek", 0.06 * softPulse);
      add(params, context, "ParamTongueOut", 0.045 * Math.max(0, pulse) * amount);
      break;
    case "bashful":
    case "flustered":
    case "shy":
    case "embarrassed":
      add(params, context, "ParamCheek", 0.14 * softPulse);
      add(params, context, "ParamCheekPuff", 0.09 * softPulse);
      add(params, context, "ParamCheekPuff2", 0.08 * softPulse);
      add(params, context, "ParamEyeBallY", -0.025 * softPulse);
      add(params, context, "ParamMouthForm", 0.035 * softPulse);
      add(params, context, "ParamMouthPuckerWiden", -0.045 * softPulse);
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
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.08 * softPulse);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.055 * softPulse);
      add(params, context, "ParamBreathPhysics_L", 0.12 * softPulse);
      break;
    case "focused":
    case "determined":
    case "guarded":
    case "frustrated":
    case "angry":
      add(params, context, "ParamEyeSmile_Angry_L", 0.08 * softPulse);
      add(params, context, "ParamEyeSmile_Angry_R", 0.08 * softPulse);
      add(params, context, "ParamBrowLY", -0.07 * softPulse);
      add(params, context, "ParamBrowRY", -0.07 * softPulse);
      add(params, context, "ParamMouthStraight", 0.06 * softPulse);
      add(params, context, "ParamMouthPressLipOpen", -0.055 * softPulse);
      add(params, context, "fire", 0.1 * softPulse);
      break;
    case "skeptical":
    case "confused":
      add(params, context, "ParamEyeLSquint", 0.09 * softPulse);
      add(params, context, "ParamEyeRSquint", 0.04 * softPulse);
      add(params, context, "ParamBrowRY", 0.07 * softPulse);
      add(params, context, "ParamMouthX", -0.06 * softPulse);
      add(params, context, "ParamMouthShrug", 0.045 * softPulse);
      add(params, context, "ParamEyeCircles", 0.08 * softPulse);
      break;
    case "reassuring":
    case "concerned":
    case "sad":
    case "crying":
    case "disappointed":
    case "apologetic":
    case "wistful":
      add(params, context, "ParamEyeLOpen", -0.035 * softPulse);
      add(params, context, "ParamEyeROpen", -0.035 * softPulse);
      add(params, context, "ParamBrowLY", 0.09 * softPulse);
      add(params, context, "ParamBrowRY", 0.09 * softPulse);
      add(params, context, "ParamMouthShrug", 0.035 * softPulse);
      add(params, context, "ParamTearDown_1", 0.09 * softPulse);
      if (emotion === "crying") {
        const tearRelease = Math.max(0, -pulse) * amount;
        add(params, context, "ParamCryDown_L", 0.18 * softPulse);
        add(params, context, "ParamTearDown_2", 0.08 * softPulse);
        add(params, context, "ParamTearDown_3", 0.05 * softPulse);
        add(params, context, "ParamTearDisappear_1", 0.18 * tearRelease);
        add(params, context, "ParamTearDisappear_2", 0.12 * tearRelease);
        add(params, context, "ParamTearDisappear_3", 0.08 * tearRelease);
      }
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
  applyFacialStyleTexture(params, context, amount, softPulse, pulse);
}

function applyFacialStyleTexture(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  softPulse: number,
  pulse: number,
): void {
  switch (context.intent.facialStyle) {
    case "radiant":
    case "bright":
      add(params, context, "ParamEyeSmile_Happy_L", 0.08 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.08 * softPulse);
      add(params, context, "ParamCheek", 0.1 * softPulse);
      add(params, context, "ParamMouthShape", 0.06 * softPulse);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.045 * softPulse);
      break;
    case "grateful":
    case "gentle":
    case "relieved":
      add(params, context, "ParamEyeSmile_Happy_L", 0.06 * softPulse);
      add(params, context, "ParamEyeSmile_Happy_R", 0.06 * softPulse);
      add(params, context, "ParamCheek", 0.055 * softPulse);
      add(params, context, "ParamMouthShape", 0.035 * softPulse);
      break;
    case "playful_smirk":
    case "mischievous":
      add(params, context, "ParamEyeLSquint", 0.1 * softPulse);
      add(params, context, "ParamEyeRSquint", 0.055 * softPulse);
      add(params, context, "ParamMouthX", 0.1 * pulse * amount);
      add(params, context, "ParamTongueOut", 0.06 * Math.max(0, pulse) * amount);
      break;
    case "flustered":
      add(params, context, "ParamCheek", 0.12 * softPulse);
      add(params, context, "ParamCheekPuff", 0.1 * softPulse);
      add(params, context, "ParamCheekPuff2", 0.08 * softPulse);
      add(params, context, "ParamMouthPuckerWiden", -0.06 * softPulse);
      break;
    case "skeptical":
      add(params, context, "ParamEyeLSquint", 0.1 * softPulse);
      add(params, context, "ParamEyeRSquint", 0.07 * softPulse);
      add(params, context, "ParamBrowRY", 0.08 * softPulse);
      add(params, context, "ParamMouthX", -0.08 * softPulse);
      break;
    case "concerned":
    case "hurt":
      add(params, context, "ParamBrowLY", 0.08 * softPulse);
      add(params, context, "ParamBrowRY", 0.07 * softPulse);
      add(params, context, "ParamMouthShrug", 0.06 * softPulse);
      add(params, context, "ParamTearDown_1", 0.06 * softPulse);
      break;
    case "shaken":
    case "frozen":
      add(params, context, "ParamPupilQuake_L1", 0.18 * softPulse);
      add(params, context, "ParamPupilQuake_R1", 0.18 * softPulse);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.07 * softPulse);
      add(params, context, "ParamMouthFunnel", 0.05 * Math.max(0, pulse) * amount);
      break;
    case "bracing":
      add(params, context, "ParamEyeLSquint", 0.12 * softPulse);
      add(params, context, "ParamEyeRSquint", 0.12 * softPulse);
      add(params, context, "ParamMouthPuckerWiden", 0.07 * softPulse);
      break;
    case "determined":
      add(params, context, "ParamEyeSmile_Angry_L", 0.08 * softPulse);
      add(params, context, "ParamEyeSmile_Angry_R", 0.08 * softPulse);
      add(params, context, "ParamMouthPressLipOpen", -0.07 * softPulse);
      break;
    case "sleepy":
    case "yawning":
      add(params, context, "ParamEyeCircles", 0.05 * softPulse);
      add(params, context, "ParamMouthFunnel", 0.05 * softPulse);
      if (context.intent.facialStyle === "yawning") {
        add(params, context, "ParamJawOpen", 0.08 * Math.max(0, pulse) * amount);
      }
      break;
    default:
      break;
  }
}

function applyReadabilityHoldLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
): void {
  amount = clamp(amount * 1.35, 0, 1.52);
  const { emotion, tone } = context.intent;
  const key = tone ?? emotion;
  switch (key) {
    case "excited":
    case "delighted":
    case "celebratory":
    case "happy":
      add(params, context, "ParamEyeSmile_Happy_L", 0.12 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", 0.12 * amount);
      add(params, context, "ParamCheek", 0.12 * amount);
      add(params, context, "ParamMouthOpenY", 0.08 * amount);
      add(params, context, "ParamMouthShape", 0.06 * amount);
      add(params, context, "ParamEyeOpenBlink_L1", 0.08 * amount);
      add(params, context, "ParamEyeOpenBlink_L2", 0.05 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.06 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.04 * amount);
      break;
    case "proud":
    case "relieved":
    case "grateful":
      add(params, context, "ParamEyeSmile_Happy_L", 0.08 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", 0.08 * amount);
      add(params, context, "ParamCheek", 0.08 * amount);
      add(params, context, "ParamMouthForm", 0.32 * amount);
      add(params, context, "ParamBodyAngleY", 0.32 * amount);
      break;
    case "reassuring":
    case "tender":
      add(params, context, "ParamBrowLY", 0.08 * amount);
      add(params, context, "ParamBrowRY", 0.08 * amount);
      add(params, context, "ParamEyeLOpen", -0.05 * amount);
      add(params, context, "ParamEyeROpen", -0.05 * amount);
      add(params, context, "ParamEyeSmile_Happy_L", 0.06 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", 0.06 * amount);
      add(params, context, "ParamCheek", 0.07 * amount);
      add(params, context, "ParamBodyAngleX", 0.34 * amount);
      break;
    case "concerned":
    case "wistful":
    case "disappointed":
    case "sad":
      add(params, context, "ParamBrowLY", 0.18 * amount);
      add(params, context, "ParamBrowRY", 0.18 * amount);
      add(params, context, "ParamEyeLOpen", -0.06 * amount);
      add(params, context, "ParamEyeROpen", -0.06 * amount);
      add(params, context, "ParamEyeBallY", -0.04 * amount);
      add(params, context, "ParamMouthForm", -0.06 * amount);
      add(params, context, "ParamMouthShrug", 0.06 * amount);
      add(params, context, "ParamTearDown_1", 0.115 * amount);
      break;
    case "apologetic":
    case "bashful":
    case "flustered":
    case "shy":
    case "embarrassed":
      add(params, context, "ParamCheek", 0.14 * amount);
      add(params, context, "ParamCheekPuff", 0.1 * amount);
      add(params, context, "ParamCheekPuff2", 0.08 * amount);
      add(params, context, "ParamEyeBallY", -0.05 * amount);
      add(params, context, "ParamMouthPuckerWiden", -0.055 * amount);
      add(params, context, "ParamMouthShrug", 0.05 * amount);
      add(params, context, "ParamBodyAngleX", -0.32 * amount);
      break;
    case "skeptical":
    case "guarded":
    case "confused":
      add(params, context, "ParamEyeLSquint", 0.12 * amount);
      add(params, context, "ParamEyeRSquint", 0.055 * amount);
      add(params, context, "ParamEyeLOpen", -0.05 * amount);
      add(params, context, "ParamBrowRY", 0.09 * amount);
      add(params, context, "ParamBrowLY", -0.09 * amount);
      add(params, context, "ParamMouthX", -0.08 * amount);
      add(params, context, "ParamMouthStraight", 0.07 * amount);
      add(params, context, "ParamMouthPressLipOpen", -0.08 * amount);
      add(params, context, "ParamEyeCircles", 0.06 * amount);
      break;
    case "focused":
    case "determined":
    case "frustrated":
    case "angry":
      add(params, context, "ParamBrowLY", -0.12 * amount);
      add(params, context, "ParamBrowRY", -0.12 * amount);
      add(params, context, "ParamEyeSmile_Angry_L", 0.1 * amount);
      add(params, context, "ParamEyeSmile_Angry_R", 0.1 * amount);
      add(params, context, "ParamMouthPressLipOpen", -0.09 * amount);
      add(params, context, "ParamMouthStraight", 0.08 * amount);
      add(params, context, "fire", 0.12 * amount);
      break;
    case "nervous":
    case "startled":
    case "panic":
    case "surprised":
      add(params, context, "ParamEyeLOpen", 0.12 * amount);
      add(params, context, "ParamEyeROpen", 0.12 * amount);
      add(params, context, "ParamBrowLY", 0.1 * amount);
      add(params, context, "ParamBrowRY", 0.1 * amount);
      add(params, context, "ParamMouthOpenY", 0.12 * amount);
      add(params, context, "ParamPupilQuake_L1", 0.16 * amount);
      add(params, context, "ParamPupilQuake_R1", 0.16 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.08 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.06 * amount);
      break;
    case "amused":
    case "playful":
    case "teasing":
      add(params, context, "ParamEyeLSquint", 0.1 * amount);
      add(params, context, "ParamEyeRSquint", 0.045 * amount);
      add(params, context, "ParamMouthX", 0.1 * amount);
      add(params, context, "ParamCheek", 0.08 * amount);
      add(params, context, "ParamTongueOut", 0.045 * amount);
      add(params, context, "ParamAngleZ", -0.7 * amount);
      break;
    case "crying":
      add(params, context, "ParamBrowLY", 0.12 * amount);
      add(params, context, "ParamBrowRY", 0.12 * amount);
      add(params, context, "ParamEyeLOpen", -0.08 * amount);
      add(params, context, "ParamEyeROpen", -0.08 * amount);
      add(params, context, "ParamMouthForm", -0.08 * amount);
      add(params, context, "ParamCryDown_L", 0.16 * amount);
      add(params, context, "ParamTearDown_1", 0.12 * amount);
      add(params, context, "ParamTearDown_2", 0.08 * amount);
      break;
    default:
      break;
  }
}

function applyReadabilityOnsetLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
): void {
  amount = clamp(amount, 0, 1);
  const atLeast = (id: string, value: number): void => {
    if (!context.hasParam(id)) return;
    const current = params[id] ?? 0;
    params[id] = Math.max(current, lerp(current, value, amount));
  };
  const atMost = (id: string, value: number): void => {
    if (!context.hasParam(id)) return;
    const current = params[id] ?? 0;
    params[id] = Math.min(current, lerp(current, value, amount));
  };

  const key = context.intent.emotion === "sleepy"
    ? "sleepy"
    : context.intent.tone ?? context.intent.emotion;
  switch (key) {
    case "excited":
    case "delighted":
    case "celebratory":
    case "happy":
      atLeast("ParamEyeSmile_Happy_L", 0.78);
      atLeast("ParamEyeSmile_Happy_R", 0.78);
      atLeast("ParamMouthForm", 0.76);
      atLeast("ParamMouthOpenY", 0.34);
      atLeast("ParamCheek", 0.72);
      break;
    case "proud":
    case "grateful":
    case "relieved":
      atLeast("ParamEyeSmile_Happy_L", 0.52);
      atLeast("ParamEyeSmile_Happy_R", 0.52);
      atLeast("ParamMouthForm", 0.58);
      atLeast("ParamCheek", 0.42);
      break;
    case "playful":
    case "amused":
    case "teasing":
      atLeast("ParamEyeLSquint", 0.56);
      atLeast("ParamEyeRSquint", 0.28);
      atLeast("ParamMouthForm", 0.62);
      atLeast("ParamMouthX", 0.48);
      atLeast("ParamCheek", 0.36);
      break;
    case "reassuring":
    case "tender":
      atMost("ParamEyeLOpen", 0.76);
      atMost("ParamEyeROpen", 0.76);
      atLeast("ParamBrowLY", 0.34);
      atLeast("ParamBrowRY", 0.34);
      atLeast("ParamEyeSmile_Happy_L", 0.34);
      atLeast("ParamEyeSmile_Happy_R", 0.34);
      atLeast("ParamMouthForm", 0.44);
      break;
    case "bashful":
    case "flustered":
    case "shy":
    case "embarrassed":
    case "apologetic":
      atMost("ParamEyeLOpen", 0.62);
      atMost("ParamEyeROpen", 0.68);
      atMost("ParamEyeBallY", -0.32);
      atLeast("ParamCheek", 0.9);
      atLeast("ParamCheekPuff", 0.3);
      atLeast("ParamMouthShrug", 0.26);
      break;
    case "nervous":
    case "startled":
    case "panic":
    case "surprised":
      atLeast("ParamEyeLOpen", 1.46);
      atLeast("ParamEyeROpen", 1.46);
      atLeast("ParamBrowLY", 0.7);
      atLeast("ParamBrowRY", 0.7);
      atLeast("ParamMouthOpenY", 0.78);
      atLeast("ParamPupilQuake_L1", 0.58);
      atLeast("ParamPupilQuake_R1", 0.58);
      break;
    case "focused":
    case "determined":
    case "guarded":
    case "frustrated":
    case "angry":
      atLeast("ParamEyeSmile_Angry_L", 0.56);
      atLeast("ParamEyeSmile_Angry_R", 0.56);
      atMost("ParamBrowLY", -0.62);
      atMost("ParamBrowRY", -0.62);
      atLeast("ParamMouthStraight", 0.36);
      atLeast("fire", 0.3);
      break;
    case "skeptical":
    case "confused":
      atLeast("ParamEyeLSquint", 0.54);
      atLeast("ParamEyeRSquint", 0.26);
      atMost("ParamBrowLY", -0.22);
      atLeast("ParamBrowRY", 0.46);
      atMost("ParamMouthX", -0.42);
      break;
    case "concerned":
    case "wistful":
    case "disappointed":
    case "sad":
    case "crying":
      atMost("ParamEyeLOpen", 0.62);
      atMost("ParamEyeROpen", 0.68);
      atLeast("ParamBrowLY", 0.68);
      atLeast("ParamBrowRY", 0.62);
      atMost("ParamMouthForm", -0.54);
      atLeast("ParamMouthShrug", 0.34);
      break;
    case "sleepy":
      atMost("ParamEyeLOpen", 0.42);
      atMost("ParamEyeROpen", 0.42);
      atLeast("ParamEyeLSquint", 0.3);
      atLeast("ParamEyeRSquint", 0.3);
      atLeast("ParamMouthFunnel", 0.14);
      break;
    default:
      break;
  }
}

function applyMouthAngleDetailLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
): void {
  amount = clamp(amount * 0.94, 0, 1.1);
  const { emotion, tone, facialStyle, mouth } = context.intent;
  const key = tone ?? emotion;
  switch (key) {
    case "excited":
    case "delighted":
    case "celebratory":
    case "happy":
      add(params, context, "ParamMouthAngleModify_YU", 0.18 * amount);
      add(params, context, "ParamMouthAngleModify_XL", -0.06 * amount);
      add(params, context, "ParamMouthAngleModify_XR", 0.06 * amount);
      break;
    case "reassuring":
    case "tender":
    case "relieved":
    case "grateful":
      add(params, context, "ParamMouthAngleModify_YU", 0.1 * amount);
      add(params, context, "ParamMouthAngleModify_YD", -0.04 * amount);
      break;
    case "concerned":
    case "sad":
    case "crying":
    case "wistful":
    case "disappointed":
    case "apologetic":
      add(params, context, "ParamMouthAngleModify_YD", 0.14 * amount);
      add(params, context, "ParamMouthAngleModify_YU", -0.05 * amount);
      break;
    case "panic":
    case "nervous":
    case "startled":
    case "surprised":
      add(params, context, "ParamMouthAngleModify_YD", 0.18 * amount);
      add(params, context, "ParamMouthAngleModify_YU", 0.06 * amount);
      break;
    case "teasing":
    case "playful":
    case "amused":
    case "skeptical":
      add(params, context, "ParamMouthAngleModify_XL", -0.16 * amount);
      add(params, context, "ParamMouthAngleModify_XR", 0.1 * amount);
      add(params, context, "ParamMouthAngleModify_YU", 0.08 * amount);
      break;
    case "angry":
    case "focused":
    case "determined":
    case "guarded":
    case "frustrated":
      add(params, context, "ParamMouthAngleModify_XL", 0.08 * amount);
      add(params, context, "ParamMouthAngleModify_XR", -0.08 * amount);
      add(params, context, "ParamMouthAngleModify_YU", -0.06 * amount);
      break;
    default:
      break;
  }

  if (facialStyle === "mischievous" || mouth === "tongue") {
    add(params, context, "ParamMouthAngleModify_XL", -0.12 * amount);
    add(params, context, "ParamMouthAngleModify_XR", 0.12 * amount);
    add(params, context, "ParamMouthAngleModify_YD", 0.08 * amount);
  }
  if (facialStyle === "hurt" || facialStyle === "concerned") {
    add(params, context, "ParamMouthAngleModify_YD", 0.08 * amount);
  }
  if (facialStyle === "bright" || facialStyle === "radiant") {
    add(params, context, "ParamMouthAngleModify_YU", 0.08 * amount);
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
    case "delighted":
    case "celebratory":
    case "happy":
      add(params, context, "ParamMouthOpenY", 0.16 * amount);
      add(params, context, "ParamJawOpen", 0.08 * amount);
      add(params, context, "ParamCheek", 0.14 * amount);
      add(params, context, "ParamBodyAngleY", 1.05 * amount);
      add(params, context, "ParamAngleY", 0.7 * amount);
      add(params, context, "ParamEyeOpenBlink_L1", 0.18 * amount);
      add(params, context, "ParamEyeOpenBlink_L2", 0.1 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.12 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.08 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.18 * amount);
      break;
    case "playful":
    case "amused":
    case "teasing":
      add(params, context, "ParamMouthX", 0.18 * amount);
      add(params, context, "ParamEyeLSquint", 0.12 * amount);
      add(params, context, "ParamEyeRSquint", 0.055 * amount);
      add(params, context, "ParamTongueOut", 0.08 * amount);
      add(params, context, "ParamAngleZ", -1.2 * amount);
      break;
    case "bashful":
    case "flustered":
    case "shy":
    case "embarrassed":
      add(params, context, "ParamCheek", 0.2 * amount);
      add(params, context, "ParamCheekPuff", 0.12 * amount);
      add(params, context, "ParamEyeBallY", -0.08 * amount);
      add(params, context, "ParamMouthPuckerWiden", -0.07 * amount);
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
      add(params, context, "ParamEyeOpenBlinkOF_L1", 0.14 * amount);
      add(params, context, "ParamEyeOpenBlinkOF_L2", 0.1 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.26 * amount);
      break;
    case "focused":
    case "determined":
    case "guarded":
    case "frustrated":
    case "angry":
      add(params, context, "ParamBrowLY", -0.14 * amount);
      add(params, context, "ParamBrowRY", -0.14 * amount);
      add(params, context, "ParamEyeSmile_Angry_L", 0.14 * amount);
      add(params, context, "ParamEyeSmile_Angry_R", 0.14 * amount);
      add(params, context, "ParamMouthPressLipOpen", -0.1 * amount);
      add(params, context, "ParamBodyAngleX", 0.9 * amount);
      add(params, context, "fire", 0.24 * amount);
      add(params, context, "ParamBreathPhysics_L", 0.2 * amount);
      break;
    case "skeptical":
    case "confused":
      add(params, context, "ParamEyeLSquint", 0.14 * amount);
      add(params, context, "ParamEyeRSquint", 0.06 * amount);
      add(params, context, "ParamMouthX", -0.14 * amount);
      add(params, context, "ParamMouthShrug", 0.06 * amount);
      add(params, context, "ParamAngleZ", -1.1 * amount);
      break;
    case "reassuring":
    case "grateful":
    case "relieved":
    case "tender":
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
    case "wistful":
      add(params, context, "ParamBrowLY", 0.12 * amount);
      add(params, context, "ParamBrowRY", 0.12 * amount);
      add(params, context, "ParamEyeBallY", -0.06 * amount);
      add(params, context, "ParamBodyAngleX", -0.7 * amount);
      add(params, context, "ParamTearDown_1", 0.14 * amount);
      if (emotion === "crying") {
        add(params, context, "ParamCryDown_L", 0.2 * amount);
        add(params, context, "ParamTearDown_2", 0.1 * amount);
        add(params, context, "ParamTearDown_3", 0.06 * amount);
      }
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
  const phoneme = 0.5 + Math.sin(elapsedMs * 0.026 + Math.sin(elapsedMs * 0.0038) * 0.9) * 0.5;
  const vowel = 0.5 + Math.sin(elapsedMs * 0.015 + 1.1) * 0.5;
  const smileBias = context.intent.emotion === "happy" || context.intent.emotion === "teasing" ? 0.04 : 0;
  const sadBias = context.intent.emotion === "sad" || context.intent.emotion === "crying" ? -0.035 : 0;
  add(params, context, "ParamMouthOpenY", (0.07 + phoneme * 0.13) * amount);
  add(params, context, "ParamJawOpen", phoneme * 0.06 * amount);
  add(params, context, "ParamMouthShape", vowel * 0.05 * amount);
  add(params, context, "ParamMouthFunnel", (1 - vowel) * 0.024 * amount);
  add(params, context, "ParamMouthPuckerWiden", (0.5 - vowel) * 0.03 * amount);
  add(params, context, "ParamMouthThickness", Math.sin(elapsedMs * 0.016) * 0.025 * amount);
  add(params, context, "ParamMouthForm", (smileBias + sadBias + Math.sin(elapsedMs * 0.011) * 0.018) * amount);
}

function applyAttentionLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const scan = Math.sin(elapsedMs * 0.0019 + emotionPhase(context.intent.emotion));
  const lift = Math.sin(elapsedMs * 0.0013 + 0.7);
  const micro = Math.sin(elapsedMs * 0.0067 + emotionPhase(context.intent.emotion) * 0.4);
  const anxious = context.intent.emotion === "panic" || context.intent.tone === "nervous" || context.intent.tone === "startled";
  const lowered = context.intent.emotion === "shy"
    || context.intent.emotion === "embarrassed"
    || context.intent.tone === "bashful"
    || context.intent.tone === "flustered"
    || context.intent.tone === "apologetic";
  const toneLeftBias = context.intent.tone === "skeptical" || context.intent.emotion === "confused" ? -0.045 : 0;
  const toneRightBias = context.intent.tone === "playful" || context.intent.tone === "amused" ? 0.04 : 0;
  add(params, context, "ParamEyeBallX", (scan * 0.045 + micro * (anxious ? 0.025 : 0.01) + toneLeftBias + toneRightBias) * amount);
  add(params, context, "ParamEyeBallY", (lift * 0.026 + (lowered ? -0.025 : 0)) * amount);
  add(params, context, "ParamAngleX", (scan * 0.45 + micro * (anxious ? 0.18 : 0.05)) * amount);
  add(params, context, "ParamAngleY", lift * 0.38 * amount);
}

function applyPoseLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const { emotion, tone } = context.intent;
  const phase = emotionPhase(emotion);
  const sway = Math.sin(elapsedMs * 0.0022 + phase);
  const lift = Math.sin(elapsedMs * 0.0031 + phase * 0.7);
  const twist = Math.sin(elapsedMs * 0.0015 + 0.9);
  const pose = poseBias(emotion, tone ?? null, amount);

  add(params, context, "ParamBodyAngleX", pose.bodyX + lift * 0.42 * amount);
  add(params, context, "ParamBodyAngleY", pose.bodyY + sway * 0.48 * amount);
  add(params, context, "ParamBodyAngleZ", pose.bodyZ + twist * 0.36 * amount);
  add(params, context, "ParamAngleX", pose.headX + sway * 0.32 * amount);
  add(params, context, "ParamAngleY", pose.headY + lift * 0.28 * amount);
  add(params, context, "ParamAngleZ", pose.headZ + twist * 0.26 * amount);
}

function applyBreathLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  amount: number,
  elapsedMs: number,
): void {
  const pulse = 0.5 + Math.sin(elapsedMs * 0.0048 + emotionPhase(context.intent.emotion)) * 0.5;
  const tense = context.intent.emotion === "panic" || context.intent.tone === "nervous" || context.intent.tone === "startled" || context.intent.tone === "frustrated";
  const relaxed = context.intent.tone === "reassuring" || context.intent.tone === "relieved" || context.intent.tone === "tender" || context.intent.emotion === "sleepy";
  const base = tense ? 0.22 : relaxed ? 0.08 : 0.14;
  add(params, context, "ParamBreath", (base + pulse * 0.14) * amount);
  add(params, context, "ParamBreathPhysics_L", (base + pulse * 0.18) * amount);
}

function applyMotionStyleLayer(
  params: Record<string, number>,
  context: RealtimeMotionLayerContext,
  style: MotionPerformanceStyleName,
  amount: number,
  elapsedMs: number,
): void {
  const slow = Math.sin(elapsedMs * 0.0028 + 0.4);
  const sway = Math.sin(elapsedMs * 0.0046 + 0.9);
  const beat = Math.max(0, Math.sin(elapsedMs * 0.0072 + 0.2));
  const fast = Math.sin(elapsedMs * 0.018 + 0.6);
  const onset = transitionPerformanceOnsetLayer(context.transitionElapsedMs);

  switch (style) {
    case "bounce":
      add(params, context, "ParamBodyAngleY", (0.7 + beat * 1.35) * amount);
      add(params, context, "ParamBodyAngleX", sway * 0.52 * amount);
      add(params, context, "ParamAngleY", (0.36 + beat * 0.72) * amount);
      add(params, context, "ParamAngleZ", sway * 0.42 * amount);
      add(params, context, "ParamCheek", beat * 0.16 * amount);
      add(params, context, "ParamBreathPhysics_L", beat * 0.2 * amount);
      break;
    case "laugh":
      add(params, context, "ParamBodyAngleY", beat * 0.82 * amount);
      add(params, context, "ParamAngleX", sway * 0.62 * amount);
      add(params, context, "ParamJawOpen", (0.08 + beat * 0.16) * amount);
      add(params, context, "ParamMouthOpenY", (0.1 + beat * 0.18) * amount);
      add(params, context, "ParamEyeSmile_Happy_L", beat * 0.14 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", beat * 0.14 * amount);
      break;
    case "soft_sway":
      add(params, context, "ParamBodyAngleZ", slow * 0.48 * amount);
      add(params, context, "ParamAngleZ", slow * 0.34 * amount);
      add(params, context, "ParamAngleY", sway * 0.24 * amount);
      add(params, context, "ParamEyeSmile_Happy_L", beat * 0.04 * amount);
      add(params, context, "ParamEyeSmile_Happy_R", beat * 0.04 * amount);
      break;
    case "peek":
      add(params, context, "ParamBodyAngleX", -0.48 * amount);
      add(params, context, "ParamBodyAngleZ", sway * 0.52 * amount);
      add(params, context, "ParamAngleZ", (0.44 + slow * 0.34) * amount);
      add(params, context, "ParamEyeBallX", (0.12 + beat * 0.08) * amount);
      add(params, context, "ParamEyeBallY", -0.08 * amount);
      add(params, context, "ParamCheek", 0.12 * amount);
      break;
    case "squirm":
      add(params, context, "ParamBodyAngleZ", sway * 0.86 * amount);
      add(params, context, "ParamAngleZ", -sway * 0.72 * amount);
      add(params, context, "ParamAngleY", -0.42 * amount);
      add(params, context, "ParamEyeBallY", -0.1 * amount);
      add(params, context, "ParamCheek", (0.12 + beat * 0.08) * amount);
      add(params, context, "ParamCheekPuff", beat * 0.08 * amount);
      break;
    case "flinch":
      add(params, context, "ParamBodyAngleX", -1.62 * onset * amount);
      add(params, context, "ParamAngleY", 0.9 * onset * amount);
      add(params, context, "ParamAngleZ", 0.52 * onset * amount);
      add(params, context, "ParamEyeLOpen", 0.18 * onset * amount);
      add(params, context, "ParamEyeROpen", 0.18 * onset * amount);
      add(params, context, "ParamMouthOpenY", 0.16 * onset * amount);
      break;
    case "double_take": {
      const doubleBeat = Math.max(0, Math.sin(elapsedMs * 0.011)) * onset;
      add(params, context, "ParamBodyAngleX", -1.18 * doubleBeat * amount);
      add(params, context, "ParamAngleX", (doubleBeat - 0.35) * 1.1 * amount);
      add(params, context, "ParamAngleZ", -0.68 * doubleBeat * amount);
      add(params, context, "ParamEyeLOpen", 0.18 * doubleBeat * amount);
      add(params, context, "ParamEyeROpen", 0.18 * doubleBeat * amount);
      break;
    }
    case "tremble":
      add(params, context, "ParamBodyAngleZ", fast * 0.52 * amount);
      add(params, context, "ParamAngleX", fast * 0.64 * amount);
      add(params, context, "ParamPupilQuake_L1", (0.14 + Math.abs(fast) * 0.2) * amount);
      add(params, context, "ParamPupilQuake_R1", (0.14 + Math.abs(fast) * 0.2) * amount);
      add(params, context, "ParamBreathPhysics_L", (0.12 + beat * 0.18) * amount);
      break;
    case "brace":
      add(params, context, "ParamBodyAngleX", -0.92 * amount);
      add(params, context, "ParamAngleY", -0.56 * amount);
      add(params, context, "ParamEyeLSquint", 0.2 * amount);
      add(params, context, "ParamEyeRSquint", 0.2 * amount);
      add(params, context, "ParamMouthPressLipOpen", -0.12 * amount);
      break;
    case "lean_in":
      add(params, context, "ParamBodyAngleX", 0.82 * amount);
      add(params, context, "ParamAngleY", 0.44 * amount);
      add(params, context, "ParamEyeLOpen", 0.08 * amount);
      add(params, context, "ParamEyeROpen", 0.08 * amount);
      break;
    case "side_eye":
      add(params, context, "ParamBodyAngleZ", -0.42 * amount);
      add(params, context, "ParamAngleZ", (-0.48 + slow * 0.22) * amount);
      add(params, context, "ParamEyeBallX", -0.16 * amount);
      add(params, context, "ParamEyeLSquint", 0.12 * amount);
      add(params, context, "ParamEyeRSquint", 0.055 * amount);
      add(params, context, "ParamMouthX", -0.08 * amount);
      break;
    case "withdraw":
      add(params, context, "ParamBodyAngleX", -0.72 * amount);
      add(params, context, "ParamAngleY", -0.52 * amount);
      add(params, context, "ParamAngleZ", slow * 0.28 * amount);
      add(params, context, "ParamEyeBallY", -0.09 * amount);
      add(params, context, "ParamMouthShrug", 0.05 * amount);
      break;
    case "sob":
      add(params, context, "ParamBodyAngleX", -0.62 * amount);
      add(params, context, "ParamBodyAngleY", -beat * 0.72 * amount);
      add(params, context, "ParamAngleY", -0.58 * amount);
      add(params, context, "ParamAngleX", sway * 0.34 * amount);
      add(params, context, "ParamCryDown_L", (0.12 + beat * 0.18) * amount);
      add(params, context, "ParamTearDisappear_1", beat * 0.16 * amount);
      add(params, context, "ParamBreathPhysics_L", (0.1 + beat * 0.16) * amount);
      break;
    case "nod":
      add(params, context, "ParamBodyAngleX", -0.32 * amount);
      add(params, context, "ParamAngleY", (-0.32 - beat * 0.9) * amount);
      add(params, context, "ParamEyeLOpen", -beat * 0.1 * amount);
      add(params, context, "ParamEyeROpen", -beat * 0.1 * amount);
      break;
    case "yawn":
      add(params, context, "ParamAngleY", -0.62 * amount);
      add(params, context, "ParamEyeLOpen", -0.14 * amount);
      add(params, context, "ParamEyeROpen", -0.14 * amount);
      add(params, context, "ParamJawOpen", (0.12 + beat * 0.16) * amount);
      add(params, context, "ParamMouthOpenY", (0.14 + beat * 0.18) * amount);
      add(params, context, "ParamMouthFunnel", 0.08 * amount);
      break;
    case "stern":
      add(params, context, "ParamBodyAngleX", 0.62 * amount);
      add(params, context, "ParamAngleY", 0.46 * amount);
      add(params, context, "ParamAngleZ", -0.3 * amount);
      add(params, context, "ParamBrowLY", -0.08 * amount);
      add(params, context, "ParamBrowRY", -0.08 * amount);
      add(params, context, "ParamMouthPressLipOpen", -0.08 * amount);
      break;
    case "still":
      break;
  }
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
      return 0.76;
    case "streaming":
      return 1;
    case "reacting":
      return 1.16;
    case "calibrating":
      return 1.04;
    case "settling":
      return 0.82;
    default:
      return 0.72;
  }
}

function emotionLayerWeight(emotion: EmotionName, tone: EmotionToneName | null): number {
  switch (tone) {
    case "excited":
    case "delighted":
    case "celebratory":
    case "startled":
    case "frustrated":
      return 1.22;
    case "playful":
    case "amused":
    case "nervous":
    case "flustered":
      return 1.14;
    case "focused":
    case "skeptical":
    case "proud":
    case "guarded":
      return 1.08;
    case "reassuring":
    case "concerned":
      return 1.02;
    case "tender":
    case "wistful":
      return 0.96;
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
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1040) return 0;
  const progress = clamp(elapsedMs / 1040, 0, 1);
  return Math.sin(progress * Math.PI) * (1 - progress * 0.22) * 0.84;
}

function transitionReadabilityOnsetLayer(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1260) return 0;
  const ramp = smoothstep(clamp(elapsedMs / 220, 0, 1));
  const fade = 1 - smoothstep(clamp((elapsedMs - 680) / 580, 0, 1));
  return (0.34 + ramp * 0.66) * fade;
}

function transitionPerformanceOnsetLayer(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1500) return 0;
  const ramp = smoothstep(clamp(elapsedMs / 180, 0, 1));
  const fade = 1 - smoothstep(clamp((elapsedMs - 760) / 740, 0, 1));
  return (0.42 + ramp * 0.58) * fade;
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

function poseBias(
  emotion: EmotionName,
  tone: EmotionToneName | null,
  amount: number,
): { bodyX: number; bodyY: number; bodyZ: number; headX: number; headY: number; headZ: number } {
  const pose = { bodyX: 0, bodyY: 0, bodyZ: 0, headX: 0, headY: 0, headZ: 0 };
  const set = (values: Partial<typeof pose>) => Object.assign(pose, values);
  switch (tone) {
    case "celebratory":
    case "excited":
    case "delighted":
      set({ bodyX: 0.62, bodyY: 0.9, headY: 0.64, headZ: tone === "delighted" ? -0.32 : 0.38 });
      break;
    case "flustered":
    case "bashful":
      set({ bodyX: -0.52, bodyZ: 0.32, headY: -0.58, headZ: 0.48 });
      break;
    case "nervous":
    case "startled":
      set({ bodyX: -0.72, bodyY: 0.34, headY: 0.46, headZ: 0.48 });
      break;
    case "focused":
    case "determined":
      set({ bodyX: 0.5, headY: 0.42, headZ: -0.22 });
      break;
    case "guarded":
    case "skeptical":
      set({ bodyX: 0.28, bodyZ: -0.36, headX: -0.28, headZ: -0.52 });
      break;
    case "reassuring":
    case "tender":
    case "grateful":
      set({ bodyX: 0.26, headY: -0.28, headZ: 0.18 });
      break;
    case "wistful":
    case "apologetic":
    case "disappointed":
      set({ bodyX: -0.42, headY: -0.58, headZ: tone === "wistful" ? -0.34 : 0.24 });
      break;
    case "frustrated":
      set({ bodyX: 0.48, bodyZ: -0.32, headY: 0.3, headZ: -0.46 });
      break;
    default:
      break;
  }
  if (!tone) {
    if (emotion === "happy" || emotion === "teasing") set({ bodyY: 0.34, headY: 0.26 });
    if (emotion === "panic" || emotion === "surprised") set({ bodyX: -0.56, headY: 0.38, headZ: 0.34 });
    if (emotion === "sad" || emotion === "crying") set({ bodyX: -0.34, headY: -0.5 });
    if (emotion === "angry") set({ bodyX: 0.38, headY: 0.28, headZ: -0.28 });
  }
  const stanceScale = 1.32;
  return {
    bodyX: pose.bodyX * amount * stanceScale,
    bodyY: pose.bodyY * amount * stanceScale,
    bodyZ: pose.bodyZ * amount * stanceScale,
    headX: pose.headX * amount * stanceScale,
    headY: pose.headY * amount * stanceScale,
    headZ: pose.headZ * amount * stanceScale,
  };
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function beatEnvelope(
  elapsedMs: number,
  periodMs: number,
  attackMs: number,
  holdMs: number,
  releaseMs: number,
  offsetMs = 0,
): number {
  const phaseMs = ((elapsedMs + offsetMs) % periodMs + periodMs) % periodMs;
  if (phaseMs < attackMs) return smoothstep(clamp(phaseMs / attackMs, 0, 1));
  if (phaseMs < attackMs + holdMs) return 1;
  if (phaseMs < attackMs + holdMs + releaseMs) {
    return 1 - smoothstep(clamp((phaseMs - attackMs - holdMs) / releaseMs, 0, 1));
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
