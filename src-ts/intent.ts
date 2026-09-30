import type { EmotionIntent, EmotionName, NormalizedEmotionIntent } from "./types.js";

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

export function normalizeIntent(intent: EmotionIntent): NormalizedEmotionIntent {
  if (!EMOTIONS.has(intent.emotion)) {
    throw new Error(`Unsupported emotion: ${intent.emotion}`);
  }
  const intensity = Number(intent.intensity ?? 0.5);
  const durationMs = Number(intent.durationMs ?? 1200);
  if (!Number.isFinite(intensity) || !Number.isFinite(durationMs)) {
    throw new Error("Intensity and duration must be finite numbers");
  }
  return {
    emotion: intent.emotion,
    intensity: clamp(intensity, 0, 1),
    gaze: intent.gaze ?? null,
    head: intent.head ?? null,
    eyes: intent.eyes ?? null,
    brows: intent.brows ?? null,
    mouth: intent.mouth ?? null,
    specialExpression: intent.specialExpression ?? null,
    durationMs: Math.max(1, Math.round(durationMs)),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

