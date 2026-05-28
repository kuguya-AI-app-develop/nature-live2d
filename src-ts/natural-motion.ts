import { normalizeIntent } from "./intent.js";
import type { EmotionIntent, EmotionName, NormalizedEmotionIntent, TimelineKeyframe, TimelinePhaseName } from "./types.js";

export interface NaturalMotionOptions {
  durationMs?: number;
  frameIntervalMs?: number;
  liveliness?: number;
  stability?: number;
  microMotion?: boolean;
  thinkingMs?: number;
  minKeyframes?: number;
  maxKeyframes?: number;
  maxParameterSpeed?: Partial<Record<string, number>>;
}

export interface NaturalMotionStep {
  t: number;
  phase: TimelinePhaseName;
  intent: EmotionIntent;
}

export interface NaturalMotionPlan {
  intent: NormalizedEmotionIntent;
  durationMs: number;
  steps: NaturalMotionStep[];
}

export function createNaturalMotionPlan(
  intentInput: EmotionIntent,
  options: NaturalMotionOptions = {},
): NaturalMotionPlan {
  const durationMs = Math.max(1, Math.round(Number(options.durationMs ?? intentInput.durationMs ?? 1200)));
  const intent = normalizeIntent({ ...intentInput, durationMs });
  const frameIntervalMs = Math.round(clamp(options.frameIntervalMs ?? 140, 50, 500));
  const minKeyframes = Math.max(2, Math.round(options.minKeyframes ?? 6));
  const maxKeyframes = Math.max(minKeyframes, Math.round(options.maxKeyframes ?? 36));
  const naturalCount = Math.floor(durationMs / frameIntervalMs) + 1;
  const keyframeCount = Math.round(clamp(naturalCount, minKeyframes, maxKeyframes));
  const liveliness = clamp(options.liveliness ?? 0.62, 0, 1);
  const fastReaction = isFastReaction(intent.emotion);
  const thinkingMs = options.thinkingMs ?? durationMs * (fastReaction ? 0.08 : 0.22);
  const thinkingEnd = clamp(thinkingMs / durationMs, fastReaction ? 0.04 : 0.1, fastReaction ? 0.16 : 0.35);
  const anticipationEnd = clamp(thinkingEnd + (fastReaction ? 0.16 : 0.22), thinkingEnd + 0.06, 0.56);
  const reactionEnd = clamp(anticipationEnd + (fastReaction ? 0.34 : 0.28), anticipationEnd + 0.12, 0.84);
  const steps: NaturalMotionStep[] = [];

  for (let index = 0; index < keyframeCount; index += 1) {
    const t = index === keyframeCount - 1
      ? durationMs
      : Math.round((durationMs * index) / (keyframeCount - 1));
    const progress = durationMs <= 0 ? 1 : t / durationMs;
    const phase = resolvePhase(progress, thinkingEnd, anticipationEnd, reactionEnd);
    const amount = resolveExpressionAmount(progress, phase, thinkingEnd, anticipationEnd, reactionEnd, fastReaction);
    const pulse = phase === "settle"
      ? Math.sin(index * 1.7) * 0.035 * liveliness
      : Math.sin(index * 1.35) * 0.018 * liveliness * amount;
    const intensity = clamp((intent.intensity * amount) + pulse, 0, 1);
    steps.push({
      t,
      phase,
      intent: createStepIntent(intent, phase, intensity, durationMs),
    });
  }

  return { intent, durationMs, steps };
}

function createStepIntent(
  target: NormalizedEmotionIntent,
  phase: TimelinePhaseName,
  intensity: number,
  durationMs: number,
): EmotionIntent {
  const useTargetModifiers = phase === "reaction" || phase === "settle";
  const targetModifiers = useTargetModifiers
    ? {
        gaze: target.gaze,
        head: target.head,
        eyes: target.eyes,
        brows: target.brows,
        mouth: target.mouth,
        specialExpression: target.specialExpression,
      }
    : {};

  return {
    emotion: target.emotion,
    intensity,
    durationMs,
    ...targetModifiers,
    ...defaultMotionModifiers(target.emotion, phase),
  };
}

function resolvePhase(
  progress: number,
  thinkingEnd: number,
  anticipationEnd: number,
  reactionEnd: number,
): TimelinePhaseName {
  if (progress <= 0) return "neutral";
  if (progress <= thinkingEnd) return "thinking";
  if (progress <= anticipationEnd) return "anticipation";
  if (progress <= reactionEnd) return "reaction";
  return "settle";
}

function resolveExpressionAmount(
  progress: number,
  phase: TimelinePhaseName,
  thinkingEnd: number,
  anticipationEnd: number,
  reactionEnd: number,
  fastReaction: boolean,
): number {
  if (phase === "neutral") return 0;
  const thinkingAmount = fastReaction ? 0.24 : 0.14;
  if (phase === "thinking") {
    return thinkingAmount * smoothstep(progress / thinkingEnd);
  }
  if (phase === "anticipation") {
    return lerp(thinkingAmount, fastReaction ? 0.62 : 0.46, smoothstep((progress - thinkingEnd) / (anticipationEnd - thinkingEnd)));
  }
  if (phase === "reaction") {
    return lerp(fastReaction ? 0.62 : 0.46, 1, easeOutCubic((progress - anticipationEnd) / (reactionEnd - anticipationEnd)));
  }
  return 1;
}

function defaultMotionModifiers(
  emotion: EmotionName,
  phase: TimelinePhaseName,
): Omit<EmotionIntent, "emotion" | "intensity" | "durationMs"> {
  if (phase === "neutral") return { specialExpression: null };

  if (phase === "thinking") {
    switch (emotion) {
      case "shy":
      case "embarrassed":
        return { gaze: "down_right", head: "lowered", eyes: "soft", specialExpression: null };
      case "sad":
      case "crying":
        return { gaze: "down", head: "lowered", eyes: "soft", brows: "worried", specialExpression: null };
      case "surprised":
      case "panic":
        return { eyes: "wide", brows: "worried", specialExpression: null };
      case "confused":
        return { gaze: "left", head: "tilted_left", brows: "worried", specialExpression: null };
      case "sleepy":
        return { head: "lowered", eyes: "sleepy", specialExpression: null };
      default:
        return { gaze: "up", eyes: "soft", specialExpression: null };
    }
  }

  if (phase === "anticipation") {
    switch (emotion) {
      case "happy":
        return { eyes: "soft", mouth: "small_smile", head: "tilted_left", specialExpression: null };
      case "shy":
      case "embarrassed":
        return { gaze: "down_right", head: "lowered", eyes: "soft", mouth: "small_smile", specialExpression: null };
      case "sad":
      case "crying":
        return { gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "frown", specialExpression: null };
      case "surprised":
      case "panic":
        return { eyes: "wide", brows: "worried", mouth: "open", specialExpression: null };
      case "teasing":
        return { gaze: "right", eyes: "soft", mouth: "small_smile", head: "tilted_right", specialExpression: null };
      case "confused":
        return { gaze: "left", head: "tilted_left", brows: "worried", mouth: "pout", specialExpression: null };
      case "angry":
        return { brows: "angry", mouth: "frown", specialExpression: null };
      case "sleepy":
        return { head: "lowered", eyes: "sleepy", specialExpression: null };
      default:
        return { eyes: "soft", specialExpression: null };
    }
  }

  if (phase === "reaction") {
    switch (emotion) {
      case "happy":
        return { eyes: "soft", mouth: "smile" };
      case "shy":
      case "embarrassed":
        return { gaze: "down_right", head: "lowered", eyes: "soft", mouth: "small_smile" };
      case "sad":
      case "crying":
        return { gaze: "down", head: "lowered", brows: "worried", mouth: "frown" };
      case "surprised":
      case "panic":
        return { eyes: "wide", brows: "worried", mouth: "open" };
      case "teasing":
        return { gaze: "right", eyes: "soft", mouth: "smile", head: "tilted_right" };
      case "confused":
        return { gaze: "left", head: "tilted_left", brows: "worried", mouth: "pout" };
      case "angry":
        return { brows: "angry", mouth: "frown" };
      case "sleepy":
        return { head: "lowered", eyes: "sleepy" };
      default:
        return {};
    }
  }

  switch (emotion) {
    case "happy":
      return { eyes: "soft", mouth: "smile", head: "tilted_left" };
    case "shy":
    case "embarrassed":
      return { gaze: "down_right", head: "lowered", eyes: "soft", mouth: "small_smile" };
    case "sad":
    case "crying":
      return { gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "frown" };
    case "surprised":
    case "panic":
      return { eyes: "wide", brows: "worried", mouth: "open" };
    case "teasing":
      return { gaze: "right", head: "tilted_right", eyes: "soft", mouth: "smile" };
    case "confused":
      return { gaze: "left", head: "tilted_left", brows: "worried", mouth: "pout" };
    case "angry":
      return { brows: "angry", mouth: "frown" };
    case "sleepy":
      return { head: "lowered", eyes: "sleepy" };
    default:
      return { eyes: "soft" };
  }
}

export function applyNaturalParameterMotion(
  params: Record<string, number>,
  step: NaturalMotionStep,
  plan: NaturalMotionPlan,
  options: NaturalMotionOptions = {},
): Record<string, number> {
  if (options.microMotion === false || step.phase === "neutral") return { ...params };
  const next = { ...params };
  const liveliness = clamp(options.liveliness ?? 0.62, 0, 1);
  const stability = clamp(options.stability ?? 0.82, 0, 1);
  const progress = plan.durationMs <= 0 ? 1 : step.t / plan.durationMs;
  const phaseWeight = step.phase === "settle" ? 1 : step.phase === "reaction" ? 0.6 : 0.25;
  const amplitude = liveliness * (1 - stability) * phaseWeight;
  const breath = Math.sin(progress * Math.PI * 1.15);
  const drift = Math.sin((progress * Math.PI * 0.72) + 0.4);

  next.ParamAngleX = (next.ParamAngleX ?? 0) + (breath * 1.2 * amplitude);
  next.ParamAngleZ = (next.ParamAngleZ ?? 0) + (drift * 0.9 * amplitude);
  next.ParamBodyAngleX = (next.ParamBodyAngleX ?? 0) + (drift * 0.7 * amplitude);
  next.ParamEyeBallX = (next.ParamEyeBallX ?? 0) + (drift * 0.05 * amplitude);
  next.ParamEyeBallY = (next.ParamEyeBallY ?? 0) + (breath * 0.035 * amplitude);
  return next;
}

export function stabilizeNaturalMotionKeyframes(
  keyframes: TimelineKeyframe[],
  options: NaturalMotionOptions = {},
): TimelineKeyframe[] {
  if (keyframes.length < 2) return keyframes.map((keyframe) => ({ ...keyframe, params: { ...keyframe.params } }));
  const stability = clamp(options.stability ?? 0.82, 0, 1);
  const speedMultiplier = lerp(1.35, 0.82, stability);
  const stabilized: TimelineKeyframe[] = [{ ...keyframes[0], params: { ...keyframes[0].params } }];

  for (let index = 1; index < keyframes.length; index += 1) {
    const previous = stabilized[index - 1];
    const current = keyframes[index];
    const deltaSeconds = Math.max(0.04, (current.t - previous.t) / 1000);
    const params: Record<string, number> = {};
    const ids = new Set([...Object.keys(previous.params), ...Object.keys(current.params)]);

    for (const id of ids) {
      const target = current.params[id] ?? previous.params[id] ?? 0;
      const start = previous.params[id] ?? target;
      const speed = options.maxParameterSpeed?.[id] ?? defaultParameterSpeed(id);
      const maxDelta = speed * speedMultiplier * deltaSeconds;
      params[id] = start + clamp(target - start, -maxDelta, maxDelta);
    }

    stabilized.push({ ...current, params });
  }

  return dampAcceleration(stabilized, stability);
}

function dampAcceleration(keyframes: TimelineKeyframe[], stability: number): TimelineKeyframe[] {
  if (keyframes.length < 3) return keyframes;
  const amount = stability * 0.28;
  const damped = keyframes.map((keyframe) => ({ ...keyframe, params: { ...keyframe.params } }));
  for (let index = 2; index < damped.length; index += 1) {
    const previousPrevious = damped[index - 2].params;
    const previous = damped[index - 1].params;
    const current = damped[index].params;
    for (const id of Object.keys(current)) {
      const projected = (previous[id] ?? 0) + ((previous[id] ?? 0) - (previousPrevious[id] ?? previous[id] ?? 0));
      current[id] = lerp(current[id], projected, amount);
    }
  }
  return damped;
}

function defaultParameterSpeed(id: string): number {
  if (id === "ParamEyeBallX" || id === "ParamEyeBallY") return 0.8;
  if (id === "ParamMouthOpenY") return 1.65;
  if (id === "ParamMouthForm") return 1.35;
  if (id === "ParamCheek") return 1.0;
  if (id.startsWith("ParamBrow")) return 1.1;
  if (id.startsWith("ParamEye") && id.endsWith("Open")) return 1.45;
  if (id.startsWith("ParamBodyAngle")) return 7;
  if (id.startsWith("ParamAngle")) return 10;
  return 1.25;
}

function isFastReaction(emotion: EmotionName): boolean {
  return emotion === "panic" || emotion === "surprised" || emotion === "angry";
}

function smoothstep(value: number): number {
  const next = clamp(value, 0, 1);
  return next * next * (3 - (2 * next));
}

function easeOutCubic(value: number): number {
  const next = 1 - clamp(value, 0, 1);
  return 1 - (next * next * next);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
