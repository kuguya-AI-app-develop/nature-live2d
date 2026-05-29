import {
  EmotionIntentStabilizer,
  KeywordEmotionEstimator,
  blendEmotionIntents,
  resolveEmotionSignalPreset,
  type EmotionSignal,
} from "./emotion-signal.js";
import {
  createLive2DParameterApplier,
  type Live2DApplyOptions,
  type Live2DFrameCallback,
  type Live2DParameterTarget,
} from "./live2d-adapter.js";
import { clampParams } from "./mapper.js";
import { hasMotionFeature } from "./motion-capability.js";
import {
  applyRealtimeMotionLayers,
  createRealtimeMotionLayerState,
  type RealtimeMotionLayerState,
} from "./realtime-motion-layers.js";
import type { Live2DExpressionEngine } from "./engine.js";
import type {
  EmotionAnalyzer,
  EmotionIntent,
  EmotionName,
  EmotionStreamAnalyzer,
  EmotionStreamAnalyzerEvent,
  EmotionToneName,
  Live2DMotionCapability,
  Live2DMotionFeature,
} from "./types.js";

export type RealtimeMotionPhase = "thinking" | "streaming" | "reacting" | "calibrating" | "settling";
export type RealtimeMotionSource = "idle" | "local" | "semantic" | "sustain";

export interface RealtimeMotionFrameMeta {
  phase: RealtimeMotionPhase;
  source: RealtimeMotionSource;
  emotion: EmotionName;
  tone?: EmotionToneName | null;
  presetId?: string | null;
  presetLabel?: string | null;
  confidence: number;
  timestampMs: number;
  localEmotion?: EmotionName;
  localPresetId?: string | null;
  semanticEmotion?: EmotionName;
  semanticPresetId?: string | null;
  semanticPending?: boolean;
  layers: RealtimeMotionLayerState;
}

export interface Live2DRealtimeMotionDirectorOptions extends Live2DApplyOptions {
  engine: Live2DExpressionEngine;
  model?: Live2DParameterTarget;
  onFrame?: (params: Record<string, number>, meta: RealtimeMotionFrameMeta) => void;
  semanticAnalyzer?: EmotionAnalyzer;
  semanticStreamAnalyzer?: EmotionStreamAnalyzer;
  semanticIntervalMs?: number;
  transitionMs?: number;
  smoothingMs?: number;
  stability?: number;
  expressiveness?: number;
  bodyMotion?: boolean;
  layeredMotion?: boolean;
  speechMotion?: boolean;
  requestFrame?: (callback: Live2DFrameCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
}

export interface RealtimeMotionTurnInput {
  promptText: string;
}

export interface Live2DRealtimeMotionDirector {
  readonly lastMeta: RealtimeMotionFrameMeta | null;
  startTurn(input: RealtimeMotionTurnInput): void;
  pushAssistantDelta(delta: string): RealtimeMotionFrameMeta | null;
  pushSemanticIntent(intent: EmotionIntent): RealtimeMotionFrameMeta;
  finishAssistantText(): void;
  reset(): void;
  stop(): void;
}

export class Live2DRealtimeMotionDirectorController implements Live2DRealtimeMotionDirector {
  private readonly engine: Live2DExpressionEngine;
  private readonly onFrame?: (params: Record<string, number>, meta: RealtimeMotionFrameMeta) => void;
  private readonly applier?: ReturnType<typeof createLive2DParameterApplier>;
  private readonly semanticAnalyzer?: EmotionAnalyzer;
  private readonly semanticStreamAnalyzer?: EmotionStreamAnalyzer;
  private readonly localEstimator: KeywordEmotionEstimator;
  private readonly stabilizer: EmotionIntentStabilizer;
  private readonly requestFrame: (callback: Live2DFrameCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly motionCapability: Live2DMotionCapability;
  private readonly safeParameterIds: Set<string>;
  private readonly semanticIntervalMs: number;
  private readonly transitionMs: number;
  private readonly smoothingMs: number;
  private readonly stability: number;
  private readonly expressiveness: number;
  private readonly bodyMotion: boolean;
  private readonly layeredMotion: boolean;
  private readonly speechMotion: boolean;
  private readonly weight: number;
  private currentParams: Record<string, number>;
  private targetParams: Record<string, number>;
  private layerState: RealtimeMotionLayerState = createRealtimeMotionLayerState();
  private transitionFromParams: Record<string, number> | null = null;
  private transitionStartedAt = -Infinity;
  private transitionDurationMs = 0;
  private expressionSwitchStartedAt = -Infinity;
  private currentIntent: EmotionIntent = { emotion: "neutral", intensity: 0.18, durationMs: 900 };
  private frame: number | null = null;
  private running = false;
  private promptText = "";
  private assistantText = "";
  private turnSerial = 0;
  private turnStartedAt = 0;
  private lastFrameAt = 0;
  private lastSemanticRequestAt = -Infinity;
  private semanticInFlight = false;
  private queuedSemanticText: string | null = null;
  private semanticStreakEmotion: EmotionName | null = null;
  private semanticStreakCount = 0;
  private semanticEventCount = 0;
  private semanticFlowAccepted = false;
  private semanticFlowEmotion: EmotionName | null = null;
  private localEmotion: EmotionName | undefined;
  private localPresetId: string | null = null;
  private semanticEmotion: EmotionName | undefined;
  private semanticPresetId: string | null = null;
  private speechEnergy = 0;
  private lastAssistantDeltaAt = -Infinity;
  private streamFinished = false;
  private phase: RealtimeMotionPhase = "settling";
  private source: RealtimeMotionSource = "idle";
  private confidence = 0.16;
  lastMeta: RealtimeMotionFrameMeta | null = null;

  constructor(options: Live2DRealtimeMotionDirectorOptions) {
    if (!options.model && !options.onFrame) {
      throw new Error("Live2DRealtimeMotionDirector requires either model or onFrame");
    }
    this.engine = options.engine;
    this.motionCapability = options.engine.getMotionCapability();
    this.safeParameterIds = new Set(this.motionCapability.safeParameterIds);
    this.onFrame = options.onFrame;
    this.applier = options.model ? createLive2DParameterApplier(options.model, options) : undefined;
    this.semanticAnalyzer = options.semanticAnalyzer;
    this.semanticStreamAnalyzer = options.semanticStreamAnalyzer ?? streamAnalyzerFrom(options.semanticAnalyzer);
    this.requestFrame = options.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.now = options.now ?? defaultNow;
    this.semanticIntervalMs = Math.max(120, options.semanticIntervalMs ?? 700);
    this.transitionMs = Math.max(100, options.transitionMs ?? 440);
    this.smoothingMs = Math.max(16, options.smoothingMs ?? 260);
    this.stability = clamp(options.stability ?? 0.74, 0, 1);
    this.expressiveness = clamp(options.expressiveness ?? 1.72, 0.5, 2.6);
    this.bodyMotion = options.bodyMotion ?? true;
    this.layeredMotion = options.layeredMotion ?? true;
    this.speechMotion = options.speechMotion ?? true;
    this.weight = options.weight ?? 1;
    const localIntensityMax = clamp(0.86 + (this.expressiveness - 1) * 0.28, 0.74, 1);
    this.localEstimator = new KeywordEmotionEstimator({
      baseIntensity: clamp(0.82 + (this.expressiveness - 1) * 0.18, 0.68, 1),
      promptBias: 0.32,
      replyBias: 0.44,
      maxIntensity: localIntensityMax,
      durationMs: 900,
      now: this.now,
    });
    this.stabilizer = new EmotionIntentStabilizer({
      holdMs: 360,
      neutralHoldMs: 720,
      switchMargin: 0.08,
      now: this.now,
    });
    this.currentParams = this.engine.generateByEmotion("neutral", { intensity: 1 }).params;
    this.targetParams = { ...this.currentParams };
  }

  startTurn(input: RealtimeMotionTurnInput): void {
    this.turnSerial += 1;
    this.promptText = input.promptText;
    this.assistantText = "";
    this.turnStartedAt = this.now();
    this.lastFrameAt = this.turnStartedAt;
    this.lastSemanticRequestAt = -Infinity;
    this.semanticInFlight = false;
    this.queuedSemanticText = null;
    this.semanticStreakEmotion = null;
    this.semanticStreakCount = 0;
    this.semanticEventCount = 0;
    this.semanticFlowAccepted = false;
    this.semanticFlowEmotion = null;
    this.semanticEmotion = undefined;
    this.semanticPresetId = null;
    this.speechEnergy = 0;
    this.lastAssistantDeltaAt = -Infinity;
    this.layerState = createRealtimeMotionLayerState();
    this.streamFinished = false;
    this.phase = "thinking";
    this.source = "idle";
    this.confidence = 0.16;
    this.stabilizer.reset();

    const promptSignal = this.localEstimator.estimate({
      promptText: this.promptText,
      replyText: "",
      timestampMs: this.turnStartedAt,
    });
    if (promptSignal.intent.emotion !== "neutral") {
      this.applyLocalSignal(promptSignal, "thinking");
    } else {
      this.localEmotion = "neutral";
      this.localPresetId = null;
      this.setIntentTarget({ emotion: "neutral", intensity: 0.18, durationMs: 900 }, 0.16, "idle", "thinking");
    }

    this.start();
    this.emitFrame(this.turnStartedAt);
  }

  pushAssistantDelta(delta: string): RealtimeMotionFrameMeta | null {
    if (!this.promptText && !this.assistantText) this.startTurn({ promptText: "" });
    this.streamFinished = false;
    this.assistantText += delta;
    const timestamp = this.now();
    this.lastAssistantDeltaAt = timestamp;
    this.speechEnergy = clamp(this.speechEnergy * 0.62 + speechEnergyForDelta(delta), 0, 1);
    const signal = this.localEstimator.estimate({
      promptText: this.promptText,
      replyText: this.assistantText,
      timestampMs: timestamp,
    });

    if (signal.intent.emotion !== "neutral") {
      this.applyLocalSignal(signal, "reacting");
    } else {
      this.setIntentTarget(
        { emotion: this.currentIntent.emotion, intensity: Math.max(this.currentIntent.intensity ?? 0.18, 0.2), durationMs: 900 },
        this.confidence,
        this.source === "semantic" ? "semantic" : "idle",
        "streaming",
      );
    }

    this.maybeRunSemanticAnalysis(isSentenceBoundary(this.assistantText), timestamp);
    return this.lastMeta;
  }

  pushSemanticIntent(intent: EmotionIntent): RealtimeMotionFrameMeta {
    return this.applySemanticIntent(intent, this.turnSerial);
  }

  finishAssistantText(): void {
    if (!this.promptText && !this.assistantText) return;
    this.streamFinished = true;
    this.phase = "settling";
    this.source = this.semanticEmotion ? "semantic" : "sustain";
    this.maybeRunSemanticAnalysis(true, this.now());
    this.emitFrame(this.now());
  }

  reset(): void {
    this.stop();
    this.promptText = "";
    this.assistantText = "";
    this.semanticEmotion = undefined;
    this.localEmotion = undefined;
    this.localPresetId = null;
    this.semanticPresetId = null;
    this.speechEnergy = 0;
    this.lastAssistantDeltaAt = -Infinity;
    this.layerState = createRealtimeMotionLayerState();
    this.streamFinished = false;
    this.semanticStreakEmotion = null;
    this.semanticStreakCount = 0;
    this.semanticEventCount = 0;
    this.semanticFlowAccepted = false;
    this.semanticFlowEmotion = null;
    this.phase = "settling";
    this.source = "idle";
    this.confidence = 0.16;
    this.currentIntent = { emotion: "neutral", intensity: 0.18, durationMs: 900 };
    this.currentParams = this.engine.generateByEmotion("neutral", { intensity: 1 }).params;
    this.targetParams = { ...this.currentParams };
    this.transitionFromParams = null;
    this.transitionStartedAt = -Infinity;
    this.transitionDurationMs = 0;
    this.expressionSwitchStartedAt = -Infinity;
    this.lastMeta = null;
    this.stabilizer.reset();
  }

  stop(): void {
    this.turnSerial += 1;
    this.running = false;
    this.semanticInFlight = false;
    this.queuedSemanticText = null;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.frame = this.requestFrame(this.tick);
  }

  private applyLocalSignal(signal: EmotionSignal, phase: RealtimeMotionPhase): void {
    const stableSignal = this.stabilizer.push(signal);
    const localIntent = capLocalIntent(stableSignal.intent, this.expressiveness);
    const isPromptReaction = phase === "thinking";
    const compatibleLocalSwitch = emotionsCompatible(this.currentIntent.emotion, localIntent.emotion);
    const amount = this.currentIntent.emotion === "neutral" || this.currentIntent.emotion === localIntent.emotion
      ? 0.66
      : isPromptReaction
        ? 0.84
        : compatibleLocalSwitch
          ? 0.74
          : 0.58;
    const blended = blendEmotionIntents(this.currentIntent, localIntent, {
      amount,
      finalSwitchAt: this.currentIntent.emotion === "neutral" ? 0.5 : isPromptReaction ? 0.62 : compatibleLocalSwitch ? 0.58 : 0.72,
    });
    this.localEmotion = localIntent.emotion;
    this.localPresetId = stableSignal.presetId ?? localIntent.presetId ?? null;
    this.setIntentTarget(blended, stableSignal.confidence, "local", phase);
  }

  private applySemanticIntent(intent: EmotionIntent, serial: number): RealtimeMotionFrameMeta {
    if (serial !== this.turnSerial) return this.lastMeta ?? this.buildMeta(this.now());
    const timestamp = this.now();
    const semanticIntent = this.streamFinished ? softenFinishedSemanticIntent(intent, this.assistantText) : intent;
    const semanticEmotion = semanticIntent.emotion;
    this.semanticEventCount += 1;
    this.semanticStreakCount = this.semanticStreakEmotion === semanticEmotion ? this.semanticStreakCount + 1 : 1;
    this.semanticStreakEmotion = semanticEmotion;
    this.semanticEmotion = semanticEmotion;
    this.semanticPresetId = semanticIntent.presetId ?? resolveEmotionSignalPreset(semanticIntent)?.presetId ?? null;

    const currentEmotion = this.currentIntent.emotion;
    const sameEmotion = currentEmotion === semanticEmotion;
    const matchesLocal = emotionsCompatible(this.localEmotion, semanticEmotion);
    const repeatedSemantic = this.semanticStreakCount >= 2
      && !blocksLocalSemanticOverride(this.localEmotion, semanticEmotion);
    const compatibleFlow = this.semanticFlowAccepted
      && this.semanticEventCount >= 2
      && emotionsCompatible(this.semanticFlowEmotion ?? currentEmotion, semanticEmotion);
    const finalSemantic = this.streamFinished
      && semanticEmotion !== "neutral"
      && !blocksLocalSemanticOverride(this.localEmotion, semanticEmotion);
    const canSwitch = currentEmotion === "neutral"
      || sameEmotion
      || matchesLocal
      || repeatedSemantic
      || compatibleFlow
      || finalSemantic;
    if (canSwitch && semanticEmotion !== "neutral") {
      this.semanticFlowAccepted = true;
      this.semanticFlowEmotion = semanticEmotion;
    }
    const switchAmount = clamp(0.82 + (this.expressiveness - 1) * 0.12, 0.72, 0.94);
    const amount = semanticEmotion === "neutral" && currentEmotion !== "neutral"
      ? 0.28
      : canSwitch
        ? switchAmount
        : 0.42;
    const blended = blendEmotionIntents(this.currentIntent, semanticIntent, {
      amount,
      finalSwitchAt: canSwitch ? 0.5 : 0.86,
      neutralFinalAmount: 0.16,
    });
    this.setIntentTarget(
      { ...blended, durationMs: semanticIntent.durationMs ?? this.currentIntent.durationMs ?? 900 },
      1,
      "semantic",
      this.streamFinished ? "settling" : "calibrating",
    );
    this.emitFrame(timestamp);
    return this.lastMeta ?? this.buildMeta(timestamp);
  }

  private setIntentTarget(
    intent: EmotionIntent,
    confidence: number,
    source: RealtimeMotionSource,
    phase: RealtimeMotionPhase,
  ): void {
    const previousEmotion = this.currentIntent.emotion;
    const resolvedIntent = withResolvedPreset(intent);
    const result = this.engine.generateFromIntent(enrichRealtimeIntent(resolvedIntent, this.expressiveness, source));
    const nextEmotion = result.sourceIntent.emotion;
    const targetChanged = paramsDistance(this.targetParams, result.params) > 0.04;
    if (expressionLayerDistance(this.targetParams, result.params) > 0.2) {
      this.expressionSwitchStartedAt = this.now();
    }
    if (targetChanged && shouldStageTransition(previousEmotion, nextEmotion, source)) {
      this.transitionFromParams = { ...this.currentParams };
      this.transitionStartedAt = this.now();
      this.transitionDurationMs = transitionDurationFor(source, this.transitionMs, result.sourceIntent.durationMs);
    }
    this.currentIntent = result.sourceIntent;
    this.targetParams = { ...result.params };
    for (const id of Object.keys(this.targetParams)) this.currentParams[id] ??= 0;
    this.confidence = clamp(confidence, 0.08, 1);
    this.source = source;
    this.phase = phase;
    this.lastMeta = this.buildMeta(this.now());
    this.start();
  }

  private maybeRunSemanticAnalysis(force: boolean, timestamp: number): void {
    if (!this.semanticAnalyzer && !this.semanticStreamAnalyzer) return;
    if (!this.assistantText.trim() && !force) return;
    if (!force && timestamp - this.lastSemanticRequestAt < this.semanticIntervalMs) return;

    const text = this.formatSemanticText();
    if (this.semanticInFlight) {
      this.queuedSemanticText = text;
      return;
    }
    this.lastSemanticRequestAt = timestamp;
    void this.runSemanticAnalysis(this.turnSerial, text);
  }

  private async runSemanticAnalysis(serial: number, text: string): Promise<void> {
    this.semanticInFlight = true;
    this.emitFrame(this.now());
    try {
      let streamed = false;
      if (this.semanticStreamAnalyzer) {
        for await (const event of this.semanticStreamAnalyzer.stream(text)) {
          const intent = intentFromSemanticStreamEvent(event);
          if (!intent) continue;
          streamed = true;
          if (serial !== this.turnSerial) return;
          this.applySemanticIntent(intent, serial);
        }
      }
      if (streamed) return;
      const intent = await this.semanticAnalyzer?.analyze(text);
      if (!intent || serial !== this.turnSerial) return;
      this.applySemanticIntent(intent, serial);
    } catch {
      if (serial === this.turnSerial) this.emitFrame(this.now());
    } finally {
      this.semanticInFlight = false;
      const queuedText = this.queuedSemanticText;
      this.queuedSemanticText = null;
      if (serial === this.turnSerial) this.emitFrame(this.now());
      if (queuedText && serial === this.turnSerial) {
        this.lastSemanticRequestAt = this.now();
        void this.runSemanticAnalysis(serial, queuedText);
      }
    }
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    this.advanceFrame(timestamp || this.now());
    this.frame = this.requestFrame(this.tick);
  };

  private advanceFrame(timestamp: number): void {
    const delta = Math.max(1, Math.min(80, timestamp - this.lastFrameAt));
    this.lastFrameAt = timestamp;
    const alpha = 1 - Math.exp(-delta / this.smoothingMs);
    const ids = new Set([...Object.keys(this.currentParams), ...Object.keys(this.targetParams)]);
    for (const id of ids) {
      const target = this.effectiveTargetFor(id, timestamp);
      const current = this.currentParams[id] ?? target;
      const desired = current + (target - current) * alpha;
      const maxDelta = frameStepLimit(id, delta, this.stability, this.expressiveness);
      this.currentParams[id] = current + clamp(desired - current, -maxDelta, maxDelta);
    }
    const speechAge = timestamp - this.lastAssistantDeltaAt;
    const speechDecayMs = speechAge > 520 ? 180 : 360;
    this.speechEnergy *= Math.exp(-delta / speechDecayMs);
    this.emitFrame(timestamp);
  }

  private effectiveTargetFor(id: string, timestamp: number): number {
    const finalTarget = this.targetParams[id] ?? 0;
    if (!this.transitionFromParams || this.transitionDurationMs <= 0) return finalTarget;

    const startValue = this.transitionFromParams[id] ?? this.currentParams[id] ?? 0;
    if (isExpressionLayerParam(id) && Number.isFinite(this.expressionSwitchStartedAt)) {
      const progress = expressionSwitchProgress(timestamp - this.expressionSwitchStartedAt);
      return startValue + (finalTarget - startValue) * progress;
    }

    const elapsed = timestamp - this.transitionStartedAt;
    const delay = transitionDelayFor(id, this.transitionDurationMs);
    const progress = smoothstep(clamp((elapsed - delay) / Math.max(1, this.transitionDurationMs - delay), 0, 1));
    if (progress >= 1) {
      if (timestamp - this.transitionStartedAt >= this.transitionDurationMs) {
        this.transitionFromParams = null;
        this.transitionStartedAt = -Infinity;
        this.transitionDurationMs = 0;
      }
      return finalTarget;
    }
    return startValue + (finalTarget - startValue) * progress;
  }

  private emitFrame(timestamp: number): void {
    const params = this.composeFrameParams(timestamp);
    const meta = this.buildMeta(timestamp);
    this.applier?.apply(params, this.weight);
    this.onFrame?.(params, meta);
    this.lastMeta = meta;
  }

  private composeFrameParams(timestamp: number): Record<string, number> {
    const params = { ...this.currentParams };
    const layers = createRealtimeMotionLayerState();
    if (this.bodyMotion) {
      const elapsed = Math.max(0, timestamp - this.turnStartedAt);
      const progress = elapsed / 1000;
      const stabilityFactor = 1 - this.stability;
      const expressivenessScale = clamp(0.76 + this.expressiveness * 0.42, 0.86, 1.82);
      const phaseWeight = this.phase === "thinking"
        ? 0.45
        : this.phase === "streaming"
          ? 0.55
          : this.phase === "reacting"
            ? 0.75
            : this.phase === "calibrating"
              ? 0.62
              : 0.5;
      const emotionWeight = motionWeightForEmotion(this.currentIntent.emotion, this.currentIntent.tone ?? null);
      const capabilityScale = 0.82 + (this.motionCapability.score * 0.42);
      const activeEmotionScale = this.currentIntent.emotion === "neutral" ? 0.65 : 1;
      const amplitude = (0.58 + stabilityFactor * 1.48) * phaseWeight * emotionWeight * capabilityScale * activeEmotionScale * expressivenessScale;
      layers.pose = Math.max(layers.pose, clamp(amplitude, 0, 2.6));
      const breath = Math.sin(progress * Math.PI * 1.25);
      const sway = Math.sin((progress * Math.PI * 0.62) + 0.35);
      const micro = Math.sin((progress * Math.PI * 2.1) + 1.1);
      if (this.hasFeature("body")) {
        if (this.hasParam("ParamBodyAngleX")) params.ParamBodyAngleX = (params.ParamBodyAngleX ?? 0) + sway * 3.35 * amplitude;
        if (this.hasParam("ParamBodyAngleY")) params.ParamBodyAngleY = (params.ParamBodyAngleY ?? 0) + breath * 1.75 * amplitude;
        if (this.hasParam("ParamBodyAngleZ")) params.ParamBodyAngleZ = (params.ParamBodyAngleZ ?? 0) + sway * 1.95 * amplitude;
      }
      if (this.hasFeature("head")) {
        if (this.hasParam("ParamAngleX")) params.ParamAngleX = (params.ParamAngleX ?? 0) + sway * 2.65 * amplitude;
        if (this.hasParam("ParamAngleY")) params.ParamAngleY = (params.ParamAngleY ?? 0) + breath * 1.45 * amplitude;
        if (this.hasParam("ParamAngleZ")) params.ParamAngleZ = (params.ParamAngleZ ?? 0) + sway * 1.35 * amplitude;
      }
      if (this.hasFeature("gaze")) {
        if (this.hasParam("ParamEyeBallX")) params.ParamEyeBallX = (params.ParamEyeBallX ?? 0) + sway * 0.04 * amplitude;
        if (this.hasParam("ParamEyeBallY")) params.ParamEyeBallY = (params.ParamEyeBallY ?? 0) + breath * 0.028 * amplitude;
      }
      if (this.hasParam("ParamBreath")) {
        params.ParamBreath = clamp((params.ParamBreath ?? 0.5) + breath * 0.4 * amplitude, 0, 1);
        layers.breath = Math.max(layers.breath, Math.abs(breath) * clamp(amplitude, 0, 2));
      }
      if ((this.currentIntent.emotion === "shy" || this.currentIntent.emotion === "embarrassed") && this.hasParam("ParamCheek")) {
        params.ParamCheek = (params.ParamCheek ?? 0) + Math.max(0, micro) * 0.06 * amplitude;
      }
      if (this.currentIntent.emotion === "teasing" && this.hasParam("ParamMouthX")) {
        params.ParamMouthX = (params.ParamMouthX ?? 0) + micro * 0.05 * amplitude;
      }
      const accent = transitionAccentAmount(timestamp - this.transitionStartedAt)
        * expressivenessScale
        * (1.12 - this.stability * 0.38)
        * activeEmotionScale;
      if (accent > 0.001) {
        layers.accent = Math.max(layers.accent, clamp(accent, 0, 2));
        const pose = emotionPoseAccent(this.currentIntent.emotion, this.currentIntent.tone ?? null, accent);
        for (const [id, value] of Object.entries(pose)) {
          if (!this.hasParam(id)) continue;
          if (id.startsWith("ParamBodyAngle") && !this.hasFeature("body")) continue;
          if (id.startsWith("ParamAngle") && !this.hasFeature("head")) continue;
          if (id.startsWith("ParamEyeBall") && !this.hasFeature("gaze")) continue;
          params[id] = (params[id] ?? 0) + value;
        }
      }
    }
    if (this.layeredMotion) {
      const layered = applyRealtimeMotionLayers(params, {
        intent: this.currentIntent,
        phase: this.phase,
        source: this.source,
        elapsedMs: Math.max(0, timestamp - this.turnStartedAt),
        transitionElapsedMs: timestamp - this.transitionStartedAt,
        speechEnergy: this.speechMotion ? this.speechEnergy : 0,
        lastAssistantDeltaAgeMs: timestamp - this.lastAssistantDeltaAt,
        expressiveness: this.expressiveness,
        stability: this.stability,
        hasParam: (id) => this.hasParam(id),
        hasFeature: (feature) => this.hasFeature(feature),
      });
      Object.assign(params, layered.params);
      layers.face = Math.max(layers.face, layered.layers.face);
      layers.speech = Math.max(layers.speech, layered.layers.speech);
      layers.gaze = Math.max(layers.gaze, layered.layers.gaze);
      layers.pose = Math.max(layers.pose, layered.layers.pose);
      layers.breath = Math.max(layers.breath, layered.layers.breath);
      layers.accent = Math.max(layers.accent, layered.layers.accent);
      layers.mask = Math.max(layers.mask, layered.layers.mask);
    }
    const blink = expressionSwitchBlinkAmount(timestamp - this.expressionSwitchStartedAt);
    if (blink > 0) {
      layers.mask = Math.max(layers.mask, blink);
      if (this.hasParam("ParamEyeLOpen")) params.ParamEyeLOpen = lerp(params.ParamEyeLOpen ?? 1, 0.08, blink);
      if (this.hasParam("ParamEyeROpen")) params.ParamEyeROpen = lerp(params.ParamEyeROpen ?? 1, 0.08, blink);
    }
    const clamped = clampParams(params, this.engine.profile).params;
    this.layerState = layers;
    return clamped;
  }

  private hasFeature(feature: Live2DMotionFeature): boolean {
    return hasMotionFeature(this.motionCapability, feature);
  }

  private hasParam(id: string): boolean {
    return this.safeParameterIds.has(id);
  }

  private buildMeta(timestamp: number): RealtimeMotionFrameMeta {
    return {
      phase: this.phase,
      source: this.source,
      emotion: this.currentIntent.emotion,
      tone: this.currentIntent.tone ?? null,
      presetId: this.currentIntent.presetId ?? null,
      presetLabel: this.currentIntent.presetLabel ?? null,
      confidence: this.confidence,
      timestampMs: timestamp,
      localEmotion: this.localEmotion,
      localPresetId: this.localPresetId,
      semanticEmotion: this.semanticEmotion,
      semanticPresetId: this.semanticPresetId,
      semanticPending: this.semanticInFlight || Boolean(this.queuedSemanticText),
      layers: { ...this.layerState },
    };
  }

  private formatSemanticText(): string {
    return [
      this.promptText ? `User: ${this.promptText}` : "",
      this.assistantText ? `Assistant: ${this.assistantText}` : "",
    ].filter(Boolean).join("\n");
  }
}

export function createLive2DRealtimeMotionDirector(
  options: Live2DRealtimeMotionDirectorOptions,
): Live2DRealtimeMotionDirectorController {
  return new Live2DRealtimeMotionDirectorController(options);
}

function streamAnalyzerFrom(analyzer: EmotionAnalyzer | undefined): EmotionStreamAnalyzer | undefined {
  const candidate = analyzer as (EmotionAnalyzer & Partial<EmotionStreamAnalyzer>) | undefined;
  const stream = candidate?.stream;
  if (typeof stream !== "function") return undefined;
  return { stream: (text: string) => stream.call(candidate, text) };
}

function intentFromSemanticStreamEvent(
  event: EmotionIntent | EmotionStreamAnalyzerEvent,
): EmotionIntent | null {
  if (!event || typeof event !== "object") return null;
  if ("intent" in event) return event.intent ?? null;
  if ("emotion" in event) return event;
  return null;
}

function withResolvedPreset(intent: EmotionIntent): EmotionIntent {
  const preset = resolveEmotionSignalPreset(intent);
  if (!preset) return intent;
  return {
    ...intent,
    presetId: intent.presetId ?? preset.presetId ?? null,
    presetLabel: intent.presetLabel ?? preset.presetLabel ?? null,
  };
}

function capLocalIntent(intent: EmotionIntent, expressiveness: number): EmotionIntent {
  const maxIntensity = clamp(0.9 + (expressiveness - 1) * 0.24, 0.78, 1);
  const minIntensity = clamp(0.58 + (expressiveness - 1) * 0.13, 0.44, 0.78);
  return {
    ...intent,
    intensity: clamp(intent.intensity ?? 0.45, minIntensity, maxIntensity),
    durationMs: intent.durationMs ?? 900,
  };
}

function enrichRealtimeIntent(
  intent: EmotionIntent,
  expressiveness: number,
  source: RealtimeMotionSource,
): EmotionIntent {
  if (intent.emotion === "neutral" || source === "idle") return intent;
  const baseIntensity = intent.intensity ?? 0.45;
  const minIntensity = emotionIntensityFloor(intent.emotion, intent.tone ?? null, expressiveness);
  const maxIntensity = source === "semantic" ? 1 : 0.98;
  const intensity = clamp(
    baseIntensity * (0.96 + expressiveness * 0.2) + (expressiveness - 1) * 0.1,
    minIntensity,
    maxIntensity,
  );
  const next: EmotionIntent = {
    ...readableIntentDefaults(intent.emotion, intent.tone ?? null, intensity, source),
    ...intent,
    intensity,
  };
  if (!intent.specialExpression && expressiveness >= 1.28) {
    if (intent.emotion === "happy" && intensity >= 0.82 && intent.tone !== "reassuring") next.specialExpression = "closed_eye_smile";
    if (intent.emotion === "crying" && intensity >= 0.62) next.specialExpression = "tears";
    if (intent.emotion === "embarrassed" && intensity >= 0.72) next.specialExpression = "tear_drop";
  }
  return next;
}

function readableIntentDefaults(
  emotion: EmotionName,
  tone: EmotionToneName | null,
  intensity: number,
  source: RealtimeMotionSource,
): Omit<EmotionIntent, "emotion" | "intensity" | "durationMs"> {
  switch (tone) {
    case "reassuring":
      return { tone, gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "small_smile" };
    case "concerned":
      return { tone, gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "pressed" };
    case "relieved":
      return { tone, eyes: "soft", brows: "soft_up", mouth: "smile", head: "raised" };
    case "proud":
      return { tone, eyes: "soft", mouth: "smile", head: "raised" };
    case "playful":
      return { tone, gaze: "right", head: "tilted_right", eyes: "soft", mouth: "smile" };
    case "bashful":
      return { tone, gaze: "down_right", head: "lowered", eyes: "soft", mouth: "small_smile" };
    case "determined":
      return { tone, head: "raised", eyes: "wide", brows: "angry", mouth: "pressed" };
    case "disappointed":
      return { tone, gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "frown" };
    case "nervous":
      return { tone, eyes: "wide", brows: "worried", mouth: "open" };
    case "excited":
      return { tone, head: "raised", eyes: "wide", mouth: "smile" };
    case "grateful":
      return { tone, gaze: "down", head: "lowered", eyes: "soft", mouth: "smile", brows: "soft_up" };
    case "amused":
      return { tone, gaze: "right", head: "tilted_right", eyes: "soft", mouth: "smile" };
    case "skeptical":
      return { tone, gaze: "left", head: "tilted_left", brows: "worried", mouth: "pout" };
    case "focused":
      return { tone, head: "raised", eyes: "wide", brows: "angry", mouth: "pressed" };
    case "apologetic":
      return { tone, gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "small_smile" };
    case "frustrated":
      return { tone, head: "raised", eyes: "wide", brows: "angry", mouth: "pressed" };
    case "startled":
      return { tone, eyes: "wide", brows: "worried", mouth: "open", head: "raised" };
    default:
      break;
  }
  switch (emotion) {
    case "happy":
      return { eyes: "soft", mouth: "smile", head: "raised" };
    case "shy":
      return { gaze: "down_right", head: "lowered", eyes: "soft", mouth: "small_smile" };
    case "embarrassed":
      return { gaze: "down_left", head: "lowered", eyes: "soft", brows: "worried", mouth: "small_smile" };
    case "sad":
    case "crying":
      return { gaze: "down", head: "lowered", eyes: "soft", brows: "worried", mouth: "frown" };
    case "surprised":
      return { eyes: "wide", brows: "worried", mouth: "open" };
    case "panic":
      if (source === "semantic" && intensity < 0.88) {
        return { eyes: "wide", brows: "worried", mouth: "frown" };
      }
      return { eyes: "wide", brows: "worried", mouth: "open" };
    case "confused":
      return { gaze: "left", head: "tilted_left", brows: "worried", mouth: "pout" };
    case "teasing":
      return { gaze: "right", head: "tilted_right", eyes: "soft", mouth: "smile" };
    case "angry":
      return { brows: "angry", mouth: "frown" };
    case "sleepy":
      return { head: "lowered", eyes: "sleepy" };
    default:
      return {};
  }
}

function emotionIntensityFloor(emotion: EmotionName, tone: EmotionToneName | null, expressiveness: number): number {
  const boost = Math.max(0, expressiveness - 1) * 0.08;
  switch (tone) {
    case "reassuring":
    case "concerned":
      return clamp(0.46 + boost, 0.38, 0.62);
    case "proud":
    case "playful":
      return clamp(0.56 + boost, 0.48, 0.7);
    case "nervous":
      return clamp(0.54 + boost, 0.46, 0.68);
    case "excited":
    case "startled":
    case "frustrated":
      return clamp(0.64 + boost, 0.56, 0.78);
    case "amused":
    case "skeptical":
    case "focused":
    case "grateful":
      return clamp(0.58 + boost, 0.5, 0.72);
    case "apologetic":
      return clamp(0.52 + boost, 0.44, 0.66);
    case "relieved":
    case "bashful":
    case "determined":
    case "disappointed":
      return clamp(0.5 + boost, 0.42, 0.64);
    default:
      break;
  }
  switch (emotion) {
    case "panic":
    case "surprised":
      return clamp(0.58 + boost, 0.5, 0.72);
    case "happy":
    case "teasing":
      return clamp(0.52 + boost, 0.44, 0.66);
    case "shy":
    case "embarrassed":
      return clamp(0.5 + boost, 0.42, 0.64);
    case "sad":
    case "crying":
    case "angry":
      return clamp(0.48 + boost, 0.4, 0.62);
    default:
      return clamp(0.42 + boost, 0.32, 0.58);
  }
}

function isSentenceBoundary(text: string): boolean {
  return /[。！？!?…，,；;]$/.test(text.trim());
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function frameStepLimit(id: string, deltaMs: number, stability: number, expressiveness = 1): number {
  const frameScale = Math.max(0.5, Math.min(4.8, deltaMs / 16.67));
  const stabilityScale = 1.15 - stability * 0.35;
  const expressivenessScale = clamp(0.86 + expressiveness * 0.32, 0.78, 1.72);
  const base = parameterStepBase(id);
  return base * frameScale * stabilityScale * expressivenessScale;
}

function parameterStepBase(id: string): number {
  if (isExpressionLayerParam(id)) return 0.32;
  if (/Angle|Body/.test(id)) return 1.45;
  if (/EyeBall/.test(id)) return 0.07;
  if (/Eye|Mouth|Brow|Cheek/.test(id)) return 0.095;
  if (/ParamExpression/.test(id)) return 0.06;
  return 0.1;
}

function motionWeightForEmotion(emotion: EmotionName, tone: EmotionToneName | null): number {
  if (tone === "excited" || tone === "startled" || tone === "frustrated") return 1.42;
  if (tone === "playful" || tone === "proud" || tone === "nervous" || tone === "amused") return 1.28;
  if (tone === "focused" || tone === "skeptical") return 1.18;
  if (tone === "reassuring" || tone === "relieved" || tone === "concerned") return 0.92;
  if (tone === "bashful" || tone === "grateful" || tone === "apologetic") return 1.08;
  switch (emotion) {
    case "panic":
    case "surprised":
      return 1.35;
    case "happy":
    case "teasing":
      return 1.14;
    case "shy":
    case "embarrassed":
      return 1.1;
    case "angry":
      return 1.18;
    case "sad":
    case "crying":
      return 1.04;
    case "sleepy":
      return 0.78;
    default:
      return 1;
  }
}

function transitionAccentAmount(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 560) return 0;
  const progress = clamp(elapsedMs / 560, 0, 1);
  return Math.sin(progress * Math.PI) * (1 - progress * 0.22);
}

function emotionPoseAccent(emotion: EmotionName, tone: EmotionToneName | null, amount: number): Record<string, number> {
  switch (tone) {
    case "reassuring":
      return {
        ParamBodyAngleX: 0.8 * amount,
        ParamAngleY: -0.9 * amount,
        ParamAngleZ: 0.45 * amount,
        ParamEyeBallY: -0.04 * amount,
      };
    case "concerned":
      return {
        ParamBodyAngleX: -0.7 * amount,
        ParamAngleY: -1.4 * amount,
        ParamEyeBallY: -0.06 * amount,
      };
    case "relieved":
      return {
        ParamBodyAngleY: 1.1 * amount,
        ParamAngleY: 1.15 * amount,
        ParamBreath: 0.08 * amount,
      };
    case "proud":
      return {
        ParamBodyAngleY: 2.35 * amount,
        ParamAngleY: 1.9 * amount,
        ParamAngleZ: -0.9 * amount,
      };
    case "playful":
      return {
        ParamBodyAngleZ: -1.55 * amount,
        ParamAngleZ: -2.8 * amount,
        ParamEyeBallX: 0.08 * amount,
        ParamMouthX: 0.1 * amount,
      };
    case "bashful":
      return {
        ParamBodyAngleX: -0.95 * amount,
        ParamAngleY: -1.55 * amount,
        ParamAngleZ: 1.25 * amount,
        ParamEyeBallY: -0.08 * amount,
        ParamCheek: 0.08 * amount,
      };
    case "determined":
      return {
        ParamBodyAngleX: 1.15 * amount,
        ParamAngleY: 1.35 * amount,
        ParamAngleZ: -0.9 * amount,
      };
    case "disappointed":
      return {
        ParamBodyAngleX: -1.05 * amount,
        ParamAngleY: -1.95 * amount,
        ParamEyeBallY: -0.08 * amount,
      };
    case "nervous":
      return {
        ParamBodyAngleX: -1.65 * amount,
        ParamBodyAngleY: 0.7 * amount,
        ParamAngleZ: 2.2 * amount,
        ParamEyeBallY: 0.05 * amount,
      };
    case "excited":
      return {
        ParamBodyAngleX: 1.9 * amount,
        ParamBodyAngleY: 2.4 * amount,
        ParamAngleY: 2.1 * amount,
        ParamAngleZ: 1.7 * amount,
        ParamBreath: 0.12 * amount,
      };
    case "grateful":
      return {
        ParamBodyAngleX: 0.9 * amount,
        ParamAngleY: -1.2 * amount,
        ParamEyeBallY: -0.04 * amount,
        ParamCheek: 0.07 * amount,
      };
    case "amused":
      return {
        ParamBodyAngleZ: -1.7 * amount,
        ParamAngleZ: -3.1 * amount,
        ParamMouthX: 0.13 * amount,
        ParamCheek: 0.06 * amount,
      };
    case "skeptical":
      return {
        ParamBodyAngleZ: -1.05 * amount,
        ParamAngleZ: -2.4 * amount,
        ParamEyeBallX: -0.08 * amount,
        ParamMouthX: -0.08 * amount,
      };
    case "focused":
      return {
        ParamBodyAngleX: 1.55 * amount,
        ParamAngleY: 1.65 * amount,
        ParamAngleZ: -0.75 * amount,
      };
    case "apologetic":
      return {
        ParamBodyAngleX: -1.2 * amount,
        ParamAngleY: -2.2 * amount,
        ParamAngleZ: 0.85 * amount,
        ParamEyeBallY: -0.08 * amount,
      };
    case "frustrated":
      return {
        ParamBodyAngleX: 1.55 * amount,
        ParamAngleY: 1.15 * amount,
        ParamAngleZ: -2.0 * amount,
      };
    case "startled":
      return {
        ParamBodyAngleX: -2.4 * amount,
        ParamBodyAngleY: 1.25 * amount,
        ParamAngleY: 1.4 * amount,
        ParamAngleZ: 2.7 * amount,
        ParamEyeBallY: 0.08 * amount,
      };
    default:
      break;
  }
  switch (emotion) {
    case "happy":
      return {
        ParamBodyAngleY: 1.8 * amount,
        ParamAngleY: 1.35 * amount,
        ParamAngleZ: -0.85 * amount,
      };
    case "shy":
      return {
        ParamBodyAngleX: -0.85 * amount,
        ParamAngleY: -1.35 * amount,
        ParamAngleZ: 1.05 * amount,
        ParamEyeBallY: -0.06 * amount,
        ParamCheek: 0.05 * amount,
      };
    case "embarrassed":
      return {
        ParamBodyAngleX: -1.05 * amount,
        ParamAngleY: -1.6 * amount,
        ParamAngleZ: 1.35 * amount,
        ParamEyeBallY: -0.08 * amount,
        ParamCheek: 0.08 * amount,
      };
    case "sad":
    case "crying":
      return {
        ParamBodyAngleX: -1.2 * amount,
        ParamAngleY: -2.1 * amount,
        ParamEyeBallY: -0.08 * amount,
      };
    case "surprised":
    case "panic":
      return {
        ParamBodyAngleX: -2.45 * amount,
        ParamBodyAngleY: 1.1 * amount,
        ParamAngleY: 1.55 * amount,
        ParamAngleZ: 2.1 * amount,
        ParamEyeBallY: 0.08 * amount,
      };
    case "confused":
      return {
        ParamBodyAngleZ: -0.9 * amount,
        ParamAngleZ: -1.9 * amount,
        ParamEyeBallX: -0.06 * amount,
      };
    case "teasing":
      return {
        ParamBodyAngleZ: -1.15 * amount,
        ParamAngleZ: -2.15 * amount,
        ParamMouthX: 0.08 * amount,
      };
    case "angry":
      return {
        ParamBodyAngleX: 1.05 * amount,
        ParamAngleY: 1.15 * amount,
        ParamAngleZ: -1.45 * amount,
      };
    default:
      return {};
  }
}

function shouldStageTransition(previous: EmotionName, next: EmotionName, source: RealtimeMotionSource): boolean {
  if (previous === next) return source === "semantic";
  return true;
}

function emotionsCompatible(a: EmotionName | undefined, b: EmotionName): boolean {
  if (!a || a === "neutral" || b === "neutral") return false;
  if (a === b) return true;
  return EMOTION_COMPATIBILITY[a]?.includes(b) ?? false;
}

function blocksLocalSemanticOverride(local: EmotionName | undefined, semantic: EmotionName): boolean {
  if (!local || local === "neutral" || local === semantic) return false;
  if (emotionsCompatible(local, semantic)) return false;
  return HIGH_PRIORITY_LOCAL_EMOTIONS.includes(local);
}

function softenFinishedSemanticIntent(intent: EmotionIntent, assistantText: string): EmotionIntent {
  if (intent.emotion !== "panic" && intent.emotion !== "angry") return intent;
  const calmingReply = /别慌|不要慌|冷静|稳住|深呼吸|一步步|逐步|检查|排查|回滚|恢复/.test(assistantText);
  const maxIntensity = intent.emotion === "panic"
    ? calmingReply ? 0.88 : 0.96
    : 0.92;
  return {
    ...intent,
    tone: intent.tone ?? (calmingReply ? "reassuring" : intent.emotion === "panic" ? "nervous" : "determined"),
    intensity: Math.min(intent.intensity ?? maxIntensity, maxIntensity),
    durationMs: Math.max(intent.durationMs ?? 1000, 1000),
    brows: intent.brows ?? "worried",
  };
}

const EMOTION_COMPATIBILITY: Partial<Record<EmotionName, EmotionName[]>> = {
  happy: ["teasing", "shy", "embarrassed"],
  shy: ["embarrassed", "happy", "teasing"],
  embarrassed: ["shy", "happy", "teasing"],
  sad: ["crying", "panic", "confused"],
  crying: ["sad"],
  surprised: ["happy"],
  teasing: ["happy", "shy", "embarrassed"],
  panic: ["sad", "confused", "surprised"],
};

const HIGH_PRIORITY_LOCAL_EMOTIONS: EmotionName[] = ["angry", "sad", "crying", "panic"];

function transitionDurationFor(source: RealtimeMotionSource, fallbackMs: number, intentDurationMs?: number): number {
  const duration = intentDurationMs ? intentDurationMs * 0.42 : fallbackMs;
  const sourceScale = source === "semantic" ? 0.92 : source === "local" ? 0.82 : 0.86;
  return clamp(duration * sourceScale, 160, 620);
}

function speechEnergyForDelta(delta: string): number {
  const visibleChars = delta.replace(/\s+/g, "").length;
  if (!visibleChars) return 0;
  const punctuationLift = /[。！？!?…，,；;]/.test(delta) ? 0.08 : 0;
  return clamp(visibleChars / 18 + punctuationLift, 0.08, 0.52);
}

function transitionDelayFor(id: string, durationMs: number): number {
  if (isExpressionLayerParam(id)) return durationMs * 0.45;
  if (/ParamExpression/.test(id)) return durationMs * 0.18;
  if (/EyeBall/.test(id)) return durationMs * 0.28;
  if (/Angle|Body/.test(id)) return durationMs * 0.2;
  if (/Brow/.test(id)) return durationMs * 0.1;
  if (/Mouth/.test(id)) return durationMs * 0.04;
  if (/Eye/.test(id)) return durationMs * 0.12;
  return durationMs * 0.08;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function paramsDistance(a: Record<string, number>, b: Record<string, number>): number {
  let distance = 0;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    distance = Math.max(distance, Math.abs((a[id] ?? 0) - (b[id] ?? 0)));
  }
  return distance;
}

function expressionLayerDistance(a: Record<string, number>, b: Record<string, number>): number {
  let distance = 0;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (isExpressionLayerParam(id)) {
      distance = Math.max(distance, Math.abs((a[id] ?? 0) - (b[id] ?? 0)));
    }
  }
  return distance;
}

function isExpressionLayerParam(id: string): boolean {
  return id.startsWith("ParamExpression_") || id.startsWith("ParamHide_") || id.includes("Hide_");
}

function expressionSwitchProgress(elapsedMs: number): number {
  return smoothstep(clamp((elapsedMs - 190) / 80, 0, 1));
}

function expressionSwitchBlinkAmount(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  const progress = clamp((elapsedMs - 125) / 230, 0, 1);
  if (progress <= 0 || progress >= 1) return 0;
  return Math.sin(progress * Math.PI) * 0.92;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}
