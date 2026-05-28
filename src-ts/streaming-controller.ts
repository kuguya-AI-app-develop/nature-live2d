import { MockEmotionAnalyzer } from "./analyzer.js";
import {
  createLive2DParameterApplier,
  type Live2DApplyOptions,
  type Live2DFrameCallback,
  type Live2DParameterTarget,
} from "./live2d-adapter.js";
import type { Live2DExpressionEngine } from "./engine.js";
import type { EmotionAnalyzer, EmotionIntent, EmotionName, ExpressionResult } from "./types.js";

interface QueuedTextAnalysis {
  text: string;
}

export interface Live2DStreamingExpressionControllerOptions extends Live2DApplyOptions {
  engine: Live2DExpressionEngine;
  model: Live2DParameterTarget;
  analyzer?: EmotionAnalyzer;
  smoothingMs?: number;
  minUpdateMs?: number;
  requestFrame?: (callback: Live2DFrameCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
}

export interface Live2DStreamingPushOptions {
  force?: boolean;
}

export class Live2DStreamingExpressionController {
  private readonly engine: Live2DExpressionEngine;
  private readonly analyzer: EmotionAnalyzer;
  private readonly applier: ReturnType<typeof createLive2DParameterApplier>;
  private readonly requestFrame: (callback: Live2DFrameCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly smoothingMs: number;
  private readonly minUpdateMs: number;
  private readonly weight: number;
  private currentParams: Record<string, number>;
  private targetParams: Record<string, number>;
  private frame: number | null = null;
  private lastFrameAt = 0;
  private lastUpdateAt = -Infinity;
  private analyzeSerial = 0;
  private analysisInFlight = false;
  private queuedTextAnalysis: QueuedTextAnalysis | null = null;
  private running = false;
  lastResult: ExpressionResult | null = null;

  constructor(options: Live2DStreamingExpressionControllerOptions) {
    this.engine = options.engine;
    this.analyzer = options.analyzer ?? new MockEmotionAnalyzer();
    this.applier = createLive2DParameterApplier(options.model, options);
    this.requestFrame = options.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.now = options.now ?? defaultNow;
    this.smoothingMs = Math.max(16, options.smoothingMs ?? 180);
    this.minUpdateMs = Math.max(0, options.minUpdateMs ?? 220);
    this.weight = options.weight ?? 1;
    this.currentParams = this.engine.generateByEmotion("neutral", { intensity: 1 }).params;
    this.targetParams = { ...this.currentParams };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameAt = this.now();
    this.frame = this.requestFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    this.queuedTextAnalysis = null;
    this.analyzeSerial += 1;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
  }

  /**
   * Analyze text with the configured analyzer and move toward the resulting intent.
   * Use this with a fast local analyzer during token streaming. For remote LLM
   * evaluation, prefer calling it once at the end or push host-derived intents
   * with pushIntent while the reply is streaming.
   */
  async pushText(text: string, options: Live2DStreamingPushOptions = {}): Promise<ExpressionResult | null> {
    const timestamp = this.now();
    if (!options.force && timestamp - this.lastUpdateAt < this.minUpdateMs) return null;
    this.lastUpdateAt = timestamp;
    if (this.analysisInFlight) {
      this.queuedTextAnalysis = { text };
      return null;
    }
    return this.runTextAnalysis(text);
  }

  private async runTextAnalysis(text: string): Promise<ExpressionResult | null> {
    this.analysisInFlight = true;
    const serial = ++this.analyzeSerial;
    try {
      const intent = await this.analyzer.analyze(text);
      if (serial !== this.analyzeSerial) return null;
      return this.pushIntent(intent);
    } finally {
      this.analysisInFlight = false;
      const queued = this.queuedTextAnalysis;
      this.queuedTextAnalysis = null;
      if (queued) {
        void this.pushText(queued.text, { force: true });
      }
    }
  }

  pushIntent(intent: EmotionIntent): ExpressionResult {
    const result = this.engine.generateFromIntent(intent);
    this.setTarget(result.params);
    this.lastResult = result;
    this.start();
    return result;
  }

  pushEmotion(emotion: EmotionName, options: Omit<EmotionIntent, "emotion"> = {}): ExpressionResult {
    return this.pushIntent({ emotion, ...options });
  }

  private setTarget(params: Record<string, number>): void {
    this.targetParams = { ...params };
    for (const id of Object.keys(this.targetParams)) {
      this.currentParams[id] ??= 0;
    }
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    const timestamp = this.now();
    const delta = Math.max(1, Math.min(80, timestamp - this.lastFrameAt));
    this.lastFrameAt = timestamp;
    const alpha = 1 - Math.exp(-delta / this.smoothingMs);
    for (const [id, target] of Object.entries(this.targetParams)) {
      const current = this.currentParams[id] ?? 0;
      this.currentParams[id] = current + (target - current) * alpha;
    }
    this.applier.apply(this.currentParams, this.weight);
    this.frame = this.requestFrame(this.tick);
  };
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
