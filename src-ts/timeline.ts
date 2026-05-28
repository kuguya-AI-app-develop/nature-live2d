import type { NormalizedEmotionIntent, TimelineExpressionResult, TimelineKeyframe } from "./types.js";

export function buildTimeline(options: {
  intent: NormalizedEmotionIntent;
  neutralParams: Record<string, number>;
  targetParams: Record<string, number>;
  warnings?: string[];
}): TimelineExpressionResult {
  const { intent, neutralParams, targetParams } = options;
  const keyframes =
    intent.durationMs < 4
      ? [
          { t: 0, params: { ...neutralParams } },
          { t: intent.durationMs, params: { ...targetParams } },
        ]
      : [
          { t: 0, params: { ...neutralParams } },
          { t: Math.round(intent.durationMs * 0.25), params: { ...targetParams } },
          { t: Math.round(intent.durationMs * 0.75), params: { ...targetParams } },
          { t: intent.durationMs, params: { ...targetParams } },
        ];

  return {
    emotion: intent.emotion,
    intensity: intent.intensity,
    durationMs: intent.durationMs,
    keyframes: dedupeKeyframes(keyframes),
    warnings: options.warnings ?? [],
  };
}

export function sampleTimeline(
  timeline: TimelineExpressionResult,
  elapsedMs: number,
): Record<string, number> {
  if (timeline.keyframes.length === 0) return {};
  const sorted = [...timeline.keyframes].sort((a, b) => a.t - b.t);
  let selected = sorted[0];
  for (const keyframe of sorted) {
    if (keyframe.t <= elapsedMs) selected = keyframe;
    else break;
  }
  return { ...selected.params };
}

function dedupeKeyframes(keyframes: TimelineKeyframe[]): TimelineKeyframe[] {
  const byTime = new Map<number, TimelineKeyframe>();
  for (const keyframe of keyframes) byTime.set(keyframe.t, keyframe);
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, keyframe]) => keyframe);
}

