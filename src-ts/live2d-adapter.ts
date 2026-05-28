import { sampleTimeline } from "./timeline.js";
import type { TimelineExpressionResult } from "./types.js";

export interface Live2DParameterTarget {
  setParameterValueById?: (id: string, value: number, weight?: number) => void;
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (id: string, value: number, weight?: number) => void;
    };
  };
}

export function applyParamsToLive2DModel(
  model: Live2DParameterTarget,
  params: Record<string, number>,
  weight = 1,
): void {
  const setter =
    model.setParameterValueById?.bind(model) ??
    model.internalModel?.coreModel?.setParameterValueById?.bind(model.internalModel.coreModel);

  if (!setter) {
    throw new Error("Live2D model does not expose setParameterValueById");
  }

  for (const [id, value] of Object.entries(params)) {
    setter(id, value, weight);
  }
}

export function playTimelineOnLive2DModel(
  model: Live2DParameterTarget,
  timeline: TimelineExpressionResult,
  options: {
    weight?: number;
    requestFrame?: (callback: FrameRequestCallback) => number;
    cancelFrame?: (handle: number) => void;
    now?: () => number;
  } = {},
): { stop: () => void } {
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  let handle: number | null = null;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const elapsed = now() - startedAt;
    applyParamsToLive2DModel(model, sampleTimeline(timeline, elapsed), options.weight ?? 1);
    if (elapsed < timeline.durationMs) {
      handle = requestFrame(tick);
    }
  };

  handle = requestFrame(tick);

  return {
    stop: () => {
      stopped = true;
      if (handle !== null) cancelFrame(handle);
    },
  };
}

