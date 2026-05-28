import type { ExpressionResult, EmotionIntent, EmotionName, SpecialExpressionName } from "./types.js";

export type EmotionSignalSource = "prompt" | "reply" | "final" | "sustain" | "fallback";

export interface EmotionSignalTextInput {
  promptText?: string;
  replyText?: string;
  text?: string;
  timestampMs?: number;
}

export interface EmotionSignal {
  source: EmotionSignalSource;
  intent: EmotionIntent;
  confidence: number;
  matched: string[];
  held: boolean;
  timestampMs: number;
  reason: string;
}

export interface EmotionSignalRule {
  emotion: EmotionName;
  patterns: Array<string | RegExp>;
  intensity?: number;
  confidence?: number;
  gaze?: string | null;
  head?: string | null;
  eyes?: string | null;
  brows?: string | null;
  mouth?: string | null;
  specialExpression?: SpecialExpressionName | null;
}

export interface KeywordEmotionEstimatorOptions {
  rules?: EmotionSignalRule[];
  baseIntensity?: number;
  promptBias?: number;
  replyBias?: number;
  minIntensity?: number;
  maxIntensity?: number;
  durationMs?: number;
  now?: () => number;
}

export interface EmotionIntentStabilizerOptions {
  holdMs?: number;
  neutralHoldMs?: number;
  switchMargin?: number;
  holdDecay?: number;
  now?: () => number;
}

export interface EmotionIntentBlendOptions {
  amount?: number;
  finalSwitchAt?: number;
  neutralFinalAmount?: number;
  allowNeutralFinal?: boolean;
}

export interface EmotionSustainOptions {
  intensityAmplitude?: number;
  minIntensity?: number;
  maxIntensity?: number;
  durationMs?: number;
  gazeCycle?: Array<string | null>;
  headCycle?: Array<string | null>;
  eyesCycle?: Array<string | null>;
  browsCycle?: Array<string | null>;
  mouthCycle?: Array<string | null>;
  now?: () => number;
}

export interface EmotionIntentTarget {
  pushIntent(intent: EmotionIntent): ExpressionResult;
}

export interface Live2DExpressionOrchestratorOptions {
  target: EmotionIntentTarget;
  estimator?: KeywordEmotionEstimator;
  estimatorOptions?: KeywordEmotionEstimatorOptions;
  stabilizer?: EmotionIntentStabilizer;
  stabilizerOptions?: EmotionIntentStabilizerOptions;
  finalBlend?: number;
}

export interface Live2DExpressionOrchestratorResult {
  signal: EmotionSignal;
  result: ExpressionResult;
}

const DEFAULT_RULES: EmotionSignalRule[] = [
  {
    emotion: "crying",
    patterns: ["哭", "眼泪", "泪珠", "tears", "cry"],
    intensity: 0.72,
    confidence: 0.72,
    specialExpression: "tears",
  },
  {
    emotion: "shy",
    patterns: ["害羞", "脸红", "不好意思", "被夸", "夸奖", "夸我", "可靠", "shy", "compliment"],
    intensity: 0.58,
    confidence: 0.68,
    gaze: "down_right",
    mouth: "small_smile",
  },
  {
    emotion: "panic",
    patterns: ["糟了", "慌", "紧急", "生产", "线上", "报错", "宕机", "事故", "urgent", "panic"],
    intensity: 0.74,
    confidence: 0.72,
  },
  {
    emotion: "surprised",
    patterns: ["哇", "居然", "没想到", "一次跑通", "惊", "surprise", "unexpected"],
    intensity: 0.66,
    confidence: 0.64,
    eyes: "wide",
    mouth: "open",
  },
  {
    emotion: "teasing",
    patterns: ["逗", "哼哼", "破绽", "调皮", "teasing", "smirk"],
    intensity: 0.56,
    confidence: 0.62,
  },
  {
    emotion: "confused",
    patterns: ["困惑", "疑惑", "不明白", "confused"],
    intensity: 0.52,
    confidence: 0.58,
  },
  {
    emotion: "angry",
    patterns: ["生气", "愤怒", "不满", "angry"],
    intensity: 0.62,
    confidence: 0.62,
  },
  {
    emotion: "sad",
    patterns: ["难过", "失败", "白忙", "累", "辛苦", "苛责", "对不起", "抱歉", "sad", "sorry"],
    intensity: 0.6,
    confidence: 0.64,
    brows: "worried",
    mouth: "frown",
  },
  {
    emotion: "happy",
    patterns: ["开心", "高兴", "笑", "顺利", "厉害", "爽", "happy", "smile"],
    intensity: 0.62,
    confidence: 0.58,
    mouth: "smile",
  },
  {
    emotion: "sleepy",
    patterns: ["困", "睡", "sleepy"],
    intensity: 0.52,
    confidence: 0.55,
    eyes: "sleepy",
  },
];

const DEFAULT_SUSTAIN_CYCLES: Record<EmotionName, Omit<EmotionSustainOptions, "now" | "durationMs" | "intensityAmplitude">> = {
  neutral: {
    eyesCycle: [null, "soft", null],
    headCycle: [null, "tilted_left", null, "tilted_right"],
    mouthCycle: [null],
  },
  happy: {
    eyesCycle: ["soft", null, "soft"],
    headCycle: [null, "tilted_left", null, "tilted_right"],
    mouthCycle: ["small_smile", "smile", "small_smile"],
  },
  shy: {
    gazeCycle: ["down_right", "down_left", "down_right"],
    headCycle: ["lowered", "tilted_right", "lowered", "tilted_left"],
    eyesCycle: ["soft", "soft", null],
    mouthCycle: ["small_smile", "small_smile", "smile"],
  },
  embarrassed: {
    gazeCycle: ["down_left", "down_right", "down_left"],
    headCycle: ["lowered", "tilted_left", "lowered", "tilted_right"],
    eyesCycle: ["soft", null, "soft"],
    mouthCycle: ["small_smile", null, "small_smile"],
  },
  angry: {
    gazeCycle: [null, "left", null, "right"],
    browsCycle: ["angry"],
    mouthCycle: ["frown", null],
  },
  sad: {
    gazeCycle: ["down", "down_left", "down"],
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["soft", null],
    browsCycle: ["worried"],
    mouthCycle: ["frown"],
  },
  crying: {
    gazeCycle: ["down", "down_left", "down_right"],
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["soft"],
    browsCycle: ["worried"],
    mouthCycle: ["frown"],
  },
  surprised: {
    gazeCycle: [null, "left", null, "right"],
    eyesCycle: ["wide", null, "wide"],
    mouthCycle: ["open", null, "open"],
  },
  confused: {
    gazeCycle: ["left", null, "right", null],
    headCycle: ["tilted_left", null, "tilted_right", null],
    browsCycle: ["worried", null],
    mouthCycle: ["pout", null],
  },
  teasing: {
    gazeCycle: ["right", null, "left", null],
    headCycle: ["tilted_right", null, "tilted_left", null],
    eyesCycle: ["soft", null],
    mouthCycle: ["small_smile", "smile", "small_smile"],
  },
  sleepy: {
    headCycle: ["lowered", null, "lowered"],
    eyesCycle: ["sleepy", "soft", "sleepy"],
    mouthCycle: [null],
  },
  panic: {
    gazeCycle: ["left", "right", null],
    eyesCycle: ["wide", null, "wide"],
    browsCycle: ["worried", null],
    mouthCycle: ["open", null],
  },
};

export class KeywordEmotionEstimator {
  private readonly rules: EmotionSignalRule[];
  private readonly baseIntensity: number;
  private readonly promptBias: number;
  private readonly replyBias: number;
  private readonly minIntensity: number;
  private readonly maxIntensity: number;
  private readonly durationMs: number;
  private readonly now: () => number;

  constructor(options: KeywordEmotionEstimatorOptions = {}) {
    this.rules = options.rules ?? DEFAULT_RULES;
    this.baseIntensity = clamp(options.baseIntensity ?? 0.75, 0, 1);
    this.promptBias = clamp(options.promptBias ?? 0.28, 0, 1);
    this.replyBias = clamp(options.replyBias ?? 0.38, 0, 1);
    this.minIntensity = clamp(options.minIntensity ?? 0.12, 0, 1);
    this.maxIntensity = clamp(options.maxIntensity ?? 0.82, 0, 1);
    this.durationMs = Math.max(1, Math.round(options.durationMs ?? 1200));
    this.now = options.now ?? defaultNow;
  }

  estimate(input: EmotionSignalTextInput | string): EmotionSignal {
    const normalized = typeof input === "string" ? { text: input } : input;
    const replyText = normalized.replyText ?? "";
    const promptText = normalized.promptText ?? normalized.text ?? "";
    const replyMatch = matchRules(replyText, this.rules);
    const promptMatch = matchRules(promptText, this.rules);
    const useReply = Boolean(replyText.trim()) && replyMatch.intent.emotion !== "neutral";
    const source: EmotionSignalSource = useReply
      ? "reply"
      : promptMatch.intent.emotion !== "neutral"
        ? "prompt"
        : "fallback";
    const match = source === "reply" ? replyMatch : source === "prompt" ? promptMatch : null;
    const text = source === "reply" ? replyText : promptText;
    const visibleLength = text.replace(/\s+/g, "").length;
    const lengthConfidence = Math.min(0.22, visibleLength / 260);
    const sourceBias = source === "reply" ? this.replyBias : source === "prompt" ? this.promptBias : 0.18;
    const confidence = clamp((match?.confidence ?? 0.18) + sourceBias + lengthConfidence, 0.08, 1);
    const matched = match?.matched ?? [];
    const intent = {
      ...(match?.intent ?? { emotion: "neutral" as const }),
      intensity: clamp((match?.intent.intensity ?? 0.45) * confidence * (this.baseIntensity / 0.75), this.minIntensity, this.maxIntensity),
      durationMs: this.durationMs,
    };
    return {
      source,
      intent,
      confidence,
      matched,
      held: false,
      timestampMs: normalized.timestampMs ?? this.now(),
      reason: matched.length ? matched.join(", ") : "no emotion keyword matched",
    };
  }
}

export class EmotionIntentStabilizer {
  private readonly holdMs: number;
  private readonly neutralHoldMs: number;
  private readonly switchMargin: number;
  private readonly holdDecay: number;
  private readonly now: () => number;
  private current: EmotionSignal | null = null;
  private changedAt = 0;

  constructor(options: EmotionIntentStabilizerOptions = {}) {
    this.holdMs = Math.max(0, options.holdMs ?? 520);
    this.neutralHoldMs = Math.max(0, options.neutralHoldMs ?? 900);
    this.switchMargin = Math.max(0, options.switchMargin ?? 0.12);
    this.holdDecay = clamp(options.holdDecay ?? 0.94, 0, 1);
    this.now = options.now ?? defaultNow;
  }

  reset(): void {
    this.current = null;
    this.changedAt = 0;
  }

  push(signal: EmotionSignal | EmotionIntent): EmotionSignal {
    const next = isEmotionSignal(signal) ? signal : createSignalFromIntent(signal, this.now());
    if (!this.current) {
      this.current = next;
      this.changedAt = next.timestampMs;
      return next;
    }

    const heldForMs = next.timestampMs - this.changedAt;
    const currentEmotion = this.current.intent.emotion;
    const nextEmotion = next.intent.emotion;
    if (currentEmotion === nextEmotion) {
      this.current = next;
      return next;
    }

    const shouldHoldNeutral = currentEmotion !== "neutral"
      && nextEmotion === "neutral"
      && heldForMs < this.neutralHoldMs;
    const shouldHoldSwitch = currentEmotion !== "neutral"
      && nextEmotion !== "neutral"
      && heldForMs < this.holdMs
      && next.confidence < this.current.confidence + this.switchMargin;
    if (shouldHoldNeutral || shouldHoldSwitch) {
      const held = {
        ...this.current,
        held: true,
        timestampMs: next.timestampMs,
        intent: {
          ...this.current.intent,
          intensity: clamp((this.current.intent.intensity ?? 0.45) * this.holdDecay, 0.08, 1),
        },
        reason: `held ${currentEmotion} over ${nextEmotion}`,
      };
      this.current = held;
      return held;
    }

    this.current = next;
    this.changedAt = next.timestampMs;
    return next;
  }
}

export class Live2DExpressionOrchestrator {
  private readonly target: EmotionIntentTarget;
  private readonly estimator: KeywordEmotionEstimator;
  private readonly stabilizer: EmotionIntentStabilizer;
  private readonly finalBlend: number;
  private lastNonSustainSignal: EmotionSignal | null = null;
  private sustainStep = 0;
  lastSignal: EmotionSignal | null = null;
  lastResult: ExpressionResult | null = null;

  constructor(options: Live2DExpressionOrchestratorOptions) {
    this.target = options.target;
    this.estimator = options.estimator ?? new KeywordEmotionEstimator(options.estimatorOptions);
    this.stabilizer = options.stabilizer ?? new EmotionIntentStabilizer(options.stabilizerOptions);
    this.finalBlend = clamp(options.finalBlend ?? 0.55, 0, 1);
  }

  reset(): void {
    this.stabilizer.reset();
    this.lastNonSustainSignal = null;
    this.sustainStep = 0;
    this.lastSignal = null;
    this.lastResult = null;
  }

  pushStreamText(input: EmotionSignalTextInput | string): Live2DExpressionOrchestratorResult {
    const signal = this.stabilizer.push(this.estimator.estimate(input));
    return this.applySignal(signal);
  }

  pushFinalIntent(
    intent: EmotionIntent,
    options: EmotionIntentBlendOptions = {},
  ): Live2DExpressionOrchestratorResult {
    const streamIntent = this.lastSignal?.intent ?? { emotion: "neutral", intensity: 0.35 };
    const blended = blendEmotionIntents(streamIntent, intent, { amount: this.finalBlend, ...options });
    const signal = createSignalFromIntent(blended, defaultNow(), "final", 1, "final calibration");
    this.stabilizer.reset();
    return this.applySignal(signal);
  }

  pushSustain(options: EmotionSustainOptions = {}): Live2DExpressionOrchestratorResult | null {
    const baseSignal = this.lastNonSustainSignal ?? this.lastSignal;
    if (!baseSignal) return null;
    this.sustainStep += 1;
    return this.applySignal(createSustainSignal(baseSignal, this.sustainStep, options));
  }

  pushIntent(intent: EmotionIntent): Live2DExpressionOrchestratorResult {
    const signal = this.stabilizer.push(intent);
    return this.applySignal(signal);
  }

  private applySignal(signal: EmotionSignal): Live2DExpressionOrchestratorResult {
    if (signal.source !== "sustain") {
      this.lastNonSustainSignal = signal;
      this.sustainStep = 0;
    }
    this.lastSignal = signal;
    const result = this.target.pushIntent(signal.intent);
    this.lastResult = result;
    return { signal, result };
  }
}

export function createKeywordEmotionEstimator(options: KeywordEmotionEstimatorOptions = {}): KeywordEmotionEstimator {
  return new KeywordEmotionEstimator(options);
}

export function estimateEmotionSignal(input: EmotionSignalTextInput | string, options: KeywordEmotionEstimatorOptions = {}): EmotionSignal {
  return new KeywordEmotionEstimator(options).estimate(input);
}

export function createEmotionIntentStabilizer(options: EmotionIntentStabilizerOptions = {}): EmotionIntentStabilizer {
  return new EmotionIntentStabilizer(options);
}

export function createLive2DExpressionOrchestrator(
  options: Live2DExpressionOrchestratorOptions,
): Live2DExpressionOrchestrator {
  return new Live2DExpressionOrchestrator(options);
}

export function blendEmotionIntents(
  streamIntent: EmotionIntent,
  finalIntent: EmotionIntent,
  options: EmotionIntentBlendOptions = {},
): EmotionIntent {
  const amount = clamp(options.amount ?? 0.55, 0, 1);
  const finalSwitchAt = clamp(options.finalSwitchAt ?? 0.5, 0, 1);
  const streamIntensity = streamIntent.intensity ?? 0.45;
  const finalIntensity = finalIntent.intensity ?? 0.45;

  if (finalIntent.emotion === "neutral" && streamIntent.emotion !== "neutral" && !options.allowNeutralFinal) {
    const neutralAmount = clamp(options.neutralFinalAmount ?? amount * 0.35, 0, 1);
    return {
      ...streamIntent,
      intensity: lerp(streamIntensity, Math.max(0.18, finalIntensity), neutralAmount),
      durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
    };
  }

  if (streamIntent.emotion === finalIntent.emotion || amount >= finalSwitchAt) {
    return {
      ...finalIntent,
      intensity: lerp(streamIntensity, finalIntensity, amount),
      durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
    };
  }

  return {
    ...streamIntent,
    intensity: lerp(streamIntensity, Math.max(streamIntensity, finalIntensity), amount),
    durationMs: finalIntent.durationMs ?? streamIntent.durationMs,
  };
}

function matchRules(text: string, rules: EmotionSignalRule[]): {
  intent: EmotionIntent;
  confidence: number;
  matched: string[];
} {
  const normalized = text.toLowerCase();
  let best: { rule: EmotionSignalRule; score: number; matched: string[] } | null = null;
  for (const rule of rules) {
    const matched = rule.patterns
      .map((pattern) => patternMatches(normalized, pattern))
      .filter((value): value is string => Boolean(value));
    if (!matched.length) continue;
    const score = matched.length + (rule.confidence ?? 0.5);
    if (!best || score > best.score) best = { rule, score, matched };
  }
  if (!best) return { intent: { emotion: "neutral", intensity: 0.4 }, confidence: 0, matched: [] };
  return {
    intent: {
      emotion: best.rule.emotion,
      intensity: best.rule.intensity ?? 0.55,
      gaze: best.rule.gaze,
      head: best.rule.head,
      eyes: best.rule.eyes,
      brows: best.rule.brows,
      mouth: best.rule.mouth,
      specialExpression: best.rule.specialExpression,
    },
    confidence: best.rule.confidence ?? 0.55,
    matched: best.matched,
  };
}

function patternMatches(text: string, pattern: string | RegExp): string | null {
  if (typeof pattern === "string") return text.includes(pattern.toLowerCase()) ? pattern : null;
  const match = text.match(pattern);
  return match?.[0] ?? null;
}

function isEmotionSignal(value: EmotionSignal | EmotionIntent): value is EmotionSignal {
  return Boolean((value as EmotionSignal).intent);
}

function createSignalFromIntent(
  intent: EmotionIntent,
  timestampMs: number,
  source: EmotionSignalSource = "fallback",
  confidence = 1,
  reason = "explicit intent",
): EmotionSignal {
  return {
    source,
    intent,
    confidence,
    matched: [],
    held: false,
    timestampMs,
    reason,
  };
}

function createSustainSignal(
  baseSignal: EmotionSignal,
  step: number,
  options: EmotionSustainOptions,
): EmotionSignal {
  const baseIntent = baseSignal.intent;
  const cycles = DEFAULT_SUSTAIN_CYCLES[baseIntent.emotion];
  const amplitude = clamp(options.intensityAmplitude ?? 0.06, 0, 0.24);
  const baseIntensity = baseIntent.intensity ?? 0.45;
  const minIntensity = clamp(options.minIntensity ?? (baseIntent.emotion === "neutral" ? 0.05 : 0.12), 0, 1);
  const maxIntensity = clamp(options.maxIntensity ?? 0.9, minIntensity, 1);
  const intensity = clamp(baseIntensity + Math.sin(step * 1.17) * amplitude, minIntensity, maxIntensity);
  const intent: EmotionIntent = {
    ...baseIntent,
    intensity,
    durationMs: Math.max(1, Math.round(options.durationMs ?? baseIntent.durationMs ?? 900)),
  };
  assignCycleValue(intent, "gaze", options.gazeCycle ?? cycles.gazeCycle, step);
  assignCycleValue(intent, "head", options.headCycle ?? cycles.headCycle, step);
  assignCycleValue(intent, "eyes", options.eyesCycle ?? cycles.eyesCycle, step);
  assignCycleValue(intent, "brows", options.browsCycle ?? cycles.browsCycle, step);
  assignCycleValue(intent, "mouth", options.mouthCycle ?? cycles.mouthCycle, step);

  return {
    source: "sustain",
    intent,
    confidence: baseSignal.confidence,
    matched: baseSignal.matched,
    held: false,
    timestampMs: options.now?.() ?? defaultNow(),
    reason: `sustaining ${baseIntent.emotion}`,
  };
}

function assignCycleValue<K extends "gaze" | "head" | "eyes" | "brows" | "mouth">(
  intent: EmotionIntent,
  key: K,
  cycle: Array<string | null> | undefined,
  step: number,
): void {
  if (!cycle?.length) return;
  intent[key] = cycle[(step - 1) % cycle.length] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function defaultNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
