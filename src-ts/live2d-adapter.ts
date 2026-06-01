import { sampleTimeline } from "./timeline.js";
import type { TimelineExpressionResult } from "./types.js";

export type Live2DRuntimeKind = "auto" | "pixi-live2d-display" | "cubism-sdk" | "custom";
export type Live2DParameterApplyTarget = "auto" | "model" | "core" | "all";
export type Live2DParameterApplyTiming = "immediate" | "before-model-update";

export type Live2DResolvedParameterId = string | number | object;
export type Live2DFrameCallback = (timestamp: number) => void;

export interface Live2DParameterTarget {
  setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
  getParameterValueById?: (id: Live2DResolvedParameterId) => number;
  coreModel?: {
    setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
    getParameterValueById?: (id: Live2DResolvedParameterId) => number;
  };
  internalModel?: {
    on?: (event: string, listener: () => void) => unknown;
    off?: (event: string, listener: () => void) => unknown;
    removeListener?: (event: string, listener: () => void) => unknown;
    coreModel?: {
      setParameterValueById?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
      getParameterValueById?: (id: Live2DResolvedParameterId) => number;
    };
  };
}

export interface Live2DApplyOptions {
  runtime?: Live2DRuntimeKind;
  weight?: number;
  applyTarget?: Live2DParameterApplyTarget;
  applyTiming?: Live2DParameterApplyTiming;
  resolveParameterId?: (id: string) => Live2DResolvedParameterId;
  setParameterValue?: (id: string, value: number, weight: number) => void;
  getParameterValue?: (id: string) => number | undefined;
  onBeforeModelUpdate?: (flush: () => void) => () => void;
}

export interface Live2DParameterApplier {
  readonly runtime: Live2DRuntimeKind;
  readonly applyTarget: Live2DParameterApplyTarget;
  readonly applyTiming: Live2DParameterApplyTiming;
  apply(params: Record<string, number>, weight?: number): void;
  flush(): void;
  read(id: string): number | undefined;
  probe(params: Record<string, number>, options?: Live2DParameterProbeOptions): Live2DParameterProbeResult[];
  dispose(): void;
}

export interface Live2DParameterProbeOptions {
  weight?: number;
  tolerance?: number;
}

export interface Live2DParameterProbeResult {
  id: string;
  requestedValue: number;
  actualValue?: number;
  difference?: number;
  tolerance: number;
  status: "matched" | "mismatch" | "unreadable";
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
  const applyTarget = options.applyTarget ?? "auto";
  const applyTiming = options.applyTiming ?? "immediate";
  const resolveParameterId = options.resolveParameterId ?? ((id: string) => id);
  const setters = resolveParameterSetters(model, options);
  const reader = resolveParameterReader(model, options);
  let bufferedFrame: { params: Record<string, number>; weight: number } | null = null;
  let disposed = false;
  const write = (params: Record<string, number>, weight: number): void => {
    for (const [id, value] of Object.entries(params)) {
      const resolvedId = resolveParameterId(id);
      for (const setter of setters) setter(id, resolvedId, value, weight);
    }
  };
  const flush = (): void => {
    if (disposed || !bufferedFrame) return;
    write(bufferedFrame.params, bufferedFrame.weight);
  };
  const disposeBeforeModelUpdate = applyTiming === "before-model-update"
    ? bindBeforeModelUpdate(model, options, flush)
    : () => {};
  const apply = (params: Record<string, number>, weight = options.weight ?? 1): void => {
    if (disposed) return;
    if (applyTiming === "before-model-update") {
      bufferedFrame = { params: { ...params }, weight };
      return;
    }
    write(params, weight);
  };
  const read = (id: string): number | undefined => reader?.(id, resolveParameterId(id));
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    bufferedFrame = null;
    disposeBeforeModelUpdate();
  };

  return {
    runtime,
    applyTarget,
    applyTiming,
    apply,
    flush,
    read,
    probe(params: Record<string, number>, probeOptions: Live2DParameterProbeOptions = {}): Live2DParameterProbeResult[] {
      const weight = probeOptions.weight ?? options.weight ?? 1;
      const tolerance = Math.max(0, probeOptions.tolerance ?? 0.035);
      write(params, weight);
      return Object.entries(params).map(([id, requestedValue]) => {
        const actualValue = read(id);
        if (!Number.isFinite(actualValue)) {
          return { id, requestedValue, tolerance, status: "unreadable" };
        }
        const difference = Math.abs((actualValue as number) - requestedValue);
        return {
          id,
          requestedValue,
          actualValue,
          difference,
          tolerance,
          status: difference <= tolerance ? "matched" : "mismatch",
        };
      });
    },
    dispose,
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

function resolveParameterSetters(
  model: Live2DParameterTarget,
  options: Live2DApplyOptions,
): Array<(rawId: string, id: Live2DResolvedParameterId, value: number, weight: number) => void> {
  if (options.setParameterValue) {
    return [(rawId, _id, value, weight) => options.setParameterValue?.(rawId, value, weight)];
  }

  const runtime = options.runtime ?? "auto";
  if (runtime === "custom") {
    throw new Error("custom Live2D runtime requires options.setParameterValue");
  }

  const direct = model.setParameterValueById?.bind(model);
  const core = model.coreModel?.setParameterValueById?.bind(model.coreModel);
  const pixiCore = model.internalModel?.coreModel?.setParameterValueById?.bind(model.internalModel.coreModel);
  const applyTarget = options.applyTarget ?? "auto";
  const setters = resolveSetterOrder({ runtime, applyTarget, direct, core, pixiCore });

  if (!setters.length) {
    throw new Error(
      `Live2D model does not expose a parameter setter for runtime "${runtime}". `
        + "Pass runtime explicitly or provide options.setParameterValue.",
    );
  }

  return setters.map((setter) => (_rawId, id, value, weight) => setter(id, value, weight));
}

function resolveParameterReader(
  model: Live2DParameterTarget,
  options: Live2DApplyOptions,
): ((rawId: string, id: Live2DResolvedParameterId) => number | undefined) | undefined {
  if (options.getParameterValue) {
    return (rawId) => options.getParameterValue?.(rawId);
  }

  const runtime = options.runtime ?? "auto";
  const applyTarget = options.applyTarget ?? "auto";
  const direct = model.getParameterValueById?.bind(model);
  const core = model.coreModel?.getParameterValueById?.bind(model.coreModel);
  const pixiCore = model.internalModel?.coreModel?.getParameterValueById?.bind(model.internalModel.coreModel);
  const reader = resolveReaderOrder({ runtime, applyTarget, direct, core, pixiCore })[0];
  return reader ? (_rawId, id) => reader(id) : undefined;
}

function bindBeforeModelUpdate(
  model: Live2DParameterTarget,
  options: Live2DApplyOptions,
  flush: () => void,
): () => void {
  if (options.onBeforeModelUpdate) return options.onBeforeModelUpdate(flush);
  const internalModel = model.internalModel;
  if (!internalModel?.on || (!internalModel.off && !internalModel.removeListener)) {
    throw new Error(
      'applyTiming "before-model-update" requires a pixi-live2d-display internalModel event emitter '
        + "or options.onBeforeModelUpdate.",
    );
  }
  internalModel.on("beforeModelUpdate", flush);
  return () => {
    if (internalModel.off) internalModel.off("beforeModelUpdate", flush);
    else internalModel.removeListener?.("beforeModelUpdate", flush);
  };
}

function resolveSetterOrder(input: {
  runtime: Live2DRuntimeKind;
  applyTarget: Live2DParameterApplyTarget;
  direct?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
  core?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
  pixiCore?: (id: Live2DResolvedParameterId, value: number, weight?: number) => void;
}): Array<(id: Live2DResolvedParameterId, value: number, weight?: number) => void> {
  const { runtime, applyTarget, direct, core, pixiCore } = input;
  if (applyTarget === "model") return compact([direct]);
  if (applyTarget === "core") {
    const setter = runtime === "pixi-live2d-display"
      ? pixiCore ?? core ?? direct
      : core ?? pixiCore ?? direct;
    return compact([setter]);
  }
  if (applyTarget === "all") {
    return runtime === "pixi-live2d-display"
      ? compact([direct, pixiCore, core])
      : runtime === "cubism-sdk"
        ? compact([direct, core, pixiCore])
        : compact([direct, pixiCore, core]);
  }
  const setter = runtime === "pixi-live2d-display"
    ? direct ?? pixiCore
    : runtime === "cubism-sdk"
      ? direct ?? core
      : direct ?? pixiCore ?? core;
  return compact([setter]);
}

function resolveReaderOrder(input: {
  runtime: Live2DRuntimeKind;
  applyTarget: Live2DParameterApplyTarget;
  direct?: (id: Live2DResolvedParameterId) => number;
  core?: (id: Live2DResolvedParameterId) => number;
  pixiCore?: (id: Live2DResolvedParameterId) => number;
}): Array<(id: Live2DResolvedParameterId) => number> {
  const { runtime, applyTarget, direct, core, pixiCore } = input;
  if (applyTarget === "model") return compact([direct]);
  if (applyTarget === "core" || applyTarget === "all") {
    return runtime === "pixi-live2d-display"
      ? compact([pixiCore, core, direct])
      : compact([core, pixiCore, direct]);
  }
  const reader = runtime === "pixi-live2d-display"
    ? direct ?? pixiCore
    : runtime === "cubism-sdk"
      ? direct ?? core
      : direct ?? pixiCore ?? core;
  return compact([reader]);
}

function compact<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => Boolean(value));
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
