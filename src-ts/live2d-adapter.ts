import { sampleTimeline } from "./timeline.js";
import type { TimelineExpressionResult } from "./types.js";

export type Live2DRuntimeKind = "auto" | "pixi-live2d-display" | "cubism-sdk" | "custom";

export type Live2DResolvedParameterId = string | number | object;
export type Live2DFrameCallback = (timestamp: number) => void;

export interface Live2DParameterTarget {
  setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
  coreModel?: {
    setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
  };
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
    };
  };
}

export interface Live2DApplyOptions {
  runtime?: Live2DRuntimeKind;
  weight?: number;
  resolveParameterId?: (id: string) => Live2DResolvedParameterId;
  setParameterValue?: (id: string, value: number, weight: number) => void;
}

export interface Live2DParameterApplier {
  readonly runtime: Live2DRuntimeKind;
  apply(params: Record<string, number>, weight?: number): void;
}

export interface Live2DTimelinePlaybackOptions extends Live2DApplyOptions {
  requestFrame?: (callback: Live2DFrameCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
}

export function applyParamsToLive2DModel(
  model: Live2DParameterTarget,
  params: Record<string, number>,
  weightOrOptions: number | Live2DApplyOptions = 1,
): void {
  const options = typeof weightOrOptions === "number" ? { weight: weightOrOptions } : weightOrOptions;
  createLive2DParameterApplier(model, options).apply(params, options.weight);
}

export function createLive2DParameterApplier(
  model: Live2DParameterTarget,
  options: Live2DApplyOptions = {},
): Live2DParameterApplier {
  const runtime = options.runtime ?? "auto";
  const resolveParameterId = options.resolveParameterId ?? ((id: string) => id);
  const setter = resolveParameterSetter(model, options);

  return {
    runtime,
    apply(params: Record<string, number>, weight = options.weight ?? 1): void {
      for (const [id, value] of Object.entries(params)) {
        setter(id, resolveParameterId(id), value, weight);
      }
    },
  };
}

export function playTimelineOnLive2DModel(
  model: Live2DParameterTarget,
  timeline: TimelineExpressionResult,
  options: Live2DTimelinePlaybackOptions = {},
): { stop: () => void } {
  const requestFrame = options.requestFrame ?? defaultRequestFrame;
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame;
  const now = options.now ?? defaultNow;
  const startedAt = now();
  let handle: number | null = null;
  let stopped = false;
  const applier = createLive2DParameterApplier(model, options);

  const tick = () => {
    if (stopped) return;
    const elapsed = now() - startedAt;
    applier.apply(sampleTimeline(timeline, elapsed), options.weight ?? 1);
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

function resolveParameterSetter(
  model: Live2DParameterTarget,
  options: Live2DApplyOptions,
): (rawId: string, id: Live2DResolvedParameterId, value: number, weight: number) => void {
  if (options.setParameterValue) {
    return (rawId, _id, value, weight) => options.setParameterValue?.(rawId, value, weight);
  }

  const runtime = options.runtime ?? "auto";
  if (runtime === "custom") {
    throw new Error("custom Live2D runtime requires options.setParameterValue");
  }

  const direct = model.setParameterValueById?.bind(model);
  const core = model.coreModel?.setParameterValueById?.bind(model.coreModel);
  const pixiCore = model.internalModel?.coreModel?.setParameterValueById?.bind(model.internalModel.coreModel);
  const setter = runtime === "pixi-live2d-display"
    ? direct ?? pixiCore
    : runtime === "cubism-sdk"
      ? direct ?? core
      : direct ?? pixiCore ?? core;

  if (!setter) {
    throw new Error(
      `Live2D model does not expose a parameter setter for runtime "${runtime}". `
        + "Pass runtime explicitly or provide options.setParameterValue.",
    );
  }

  return (_rawId, id, value, weight) => setter(id, value, weight);
}

function defaultRequestFrame(callback: Live2DFrameCallback): number {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error("requestFrame option is required when requestAnimationFrame is unavailable");
  }
  return globalThis.requestAnimationFrame(callback);
}

function defaultCancelFrame(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame !== "function") return;
  globalThis.cancelAnimationFrame(handle);
}

function defaultNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
