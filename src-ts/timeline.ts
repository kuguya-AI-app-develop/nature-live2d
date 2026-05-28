import type { NormalizedEmotionIntent, TimelineExpressionResult, TimelineKeyframe } from "./types.js";

export interface TimelineSampleOptions {
  interpolate?: boolean;
  easing?: boolean;
}

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
  options: TimelineSampleOptions = {},
): Record<string, number> {
  if (timeline.keyframes.length === 0) return {};
  const sorted = [...timeline.keyframes].sort((a, b) => a.t - b.t);
  const timestamp = Math.max(0, elapsedMs);
  if (timestamp <= sorted[0].t) return { ...sorted[0].params };
  const last = sorted[sorted.length - 1];
  if (timestamp >= last.t) return { ...last.params };

  let previous = sorted[0];
  let next = last;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].t >= timestamp) {
      next = sorted[index];
      break;
    }
    previous = sorted[index];
  }

  if (options.interpolate === false || previous.t === next.t) {
    return { ...previous.params };
  }

  const rawAmount = (timestamp - previous.t) / (next.t - previous.t);
  const amount = options.easing === false ? rawAmount : smoothstep(rawAmount);
  const params: Record<string, number> = {};
  const ids = new Set([...Object.keys(previous.params), ...Object.keys(next.params)]);
  for (const id of ids) {
    const start = previous.params[id] ?? next.params[id] ?? 0;
    const end = next.params[id] ?? previous.params[id] ?? 0;
    params[id] = lerp(start, end, amount);
  }
  return params;
}

function dedupeKeyframes(keyframes: TimelineKeyframe[]): TimelineKeyframe[] {
  const byTime = new Map<number, TimelineKeyframe>();
  for (const keyframe of keyframes) byTime.set(keyframe.t, keyframe);
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, keyframe]) => keyframe);
}

function smoothstep(value: number): number {
  const next = Math.max(0, Math.min(1, value));
  return next * next * (3 - (2 * next));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, amount));
}
