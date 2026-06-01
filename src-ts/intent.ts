import type {
  EmotionIntent,
  EmotionName,
  EmotionToneName,
  FacialPerformanceStyleName,
  MotionPerformanceStyleName,
  NormalizedEmotionIntent,
} from "./types.js";
import { MOTION_PERFORMANCE_STYLES } from "./motion-style.js";

const EMOTIONS = new Set<EmotionName>([
  "neutral",
  "happy",
  "shy",
  "embarrassed",
  "angry",
  "sad",
  "crying",
  "surprised",
  "confused",
  "teasing",
  "sleepy",
  "panic",
]);

const TONES = new Set<EmotionToneName>([
  "concerned",
  "reassuring",
  "relieved",
  "proud",
  "playful",
  "bashful",
  "determined",
  "disappointed",
  "nervous",
  "excited",
  "grateful",
  "amused",
  "skeptical",
  "focused",
  "apologetic",
  "frustrated",
  "startled",
  "delighted",
  "flustered",
  "celebratory",
  "tender",
  "wistful",
  "guarded",
]);

const FACIAL_STYLES = new Set<FacialPerformanceStyleName>([
  "radiant",
  "bright",
  "grateful",
  "gentle",
  "relieved",
  "playful_smirk",
  "mischievous",
  "flustered",
  "skeptical",
  "concerned",
  "shaken",
  "frozen",
  "bracing",
  "determined",
  "hurt",
  "sleepy",
  "yawning",
]);

const MOTION_STYLES = new Set<MotionPerformanceStyleName>(MOTION_PERFORMANCE_STYLES);

export function normalizeIntent(intent: EmotionIntent): NormalizedEmotionIntent {
  if (!EMOTIONS.has(intent.emotion)) {
    throw new Error(`Unsupported emotion: ${intent.emotion}`);
  }
  const tone = intent.tone ?? null;
  if (tone && !TONES.has(tone)) {
    throw new Error(`Unsupported emotion tone: ${tone}`);
  }
  const facialStyle = intent.facialStyle ?? null;
  if (facialStyle && !FACIAL_STYLES.has(facialStyle)) {
    throw new Error(`Unsupported facial performance style: ${facialStyle}`);
  }
  const motionStyle = intent.motionStyle ?? null;
  if (motionStyle && !MOTION_STYLES.has(motionStyle)) {
    throw new Error(`Unsupported motion performance style: ${motionStyle}`);
  }
  return {
    emotion: intent.emotion,
    tone,
    presetId: intent.presetId ?? null,
    presetLabel: intent.presetLabel ?? null,
    intensity: clamp(Number(intent.intensity ?? 0.5), 0, 1),
    gaze: intent.gaze ?? null,
    head: intent.head ?? null,
    eyes: intent.eyes ?? null,
    brows: intent.brows ?? null,
    mouth: intent.mouth ?? null,
    facialStyle,
    motionStyle,
    specialExpression: intent.specialExpression ?? null,
    durationMs: Math.max(1, Math.round(Number(intent.durationMs ?? 1200))),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
