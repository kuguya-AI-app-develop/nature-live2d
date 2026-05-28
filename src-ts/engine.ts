import { MockEmotionAnalyzer } from "./analyzer.js";
import { normalizeIntent } from "./intent.js";
import { clampParams, mapIntentToParams } from "./mapper.js";
import {
  applyNaturalParameterMotion,
  createNaturalMotionPlan,
  stabilizeNaturalMotionKeyframes,
  type NaturalMotionOptions,
} from "./natural-motion.js";
import { buildCharacterProfile } from "./profile.js";
import { createResourceSetFromUrls } from "./resources.js";
import { buildTimeline } from "./timeline.js";
import type {
  CharacterProfile,
  EmotionAnalyzer,
  EmotionIntent,
  EmotionName,
  ExpressionResult,
  Live2DResourceSet,
  Live2DResourceUrls,
  SpecialExpressionName,
  TimelineExpressionResult,
} from "./types.js";

export interface Live2DExpressionEngineOptions {
  analyzer?: EmotionAnalyzer;
}

export interface GenerateEmotionOptions {
  intensity?: number;
  gaze?: string | null;
  head?: string | null;
  eyes?: string | null;
  brows?: string | null;
  mouth?: string | null;
  specialExpression?: SpecialExpressionName | null;
  durationMs?: number;
}

export interface GenerateNaturalTimelineOptions extends GenerateEmotionOptions, NaturalMotionOptions {}

export class Live2DExpressionEngine {
  readonly profile: CharacterProfile;
  readonly analyzer: EmotionAnalyzer;

  constructor(profile: CharacterProfile, options: Live2DExpressionEngineOptions = {}) {
    this.profile = profile;
    this.analyzer = options.analyzer ?? new MockEmotionAnalyzer();
  }

  static async fromResourceSet(
    resources: Live2DResourceSet,
    options: Live2DExpressionEngineOptions & { fetcher?: typeof fetch } = {},
  ): Promise<Live2DExpressionEngine> {
    return new Live2DExpressionEngine(await buildCharacterProfile(resources, options), options);
  }

  static async fromUrls(
    resources: Live2DResourceUrls,
    options: Live2DExpressionEngineOptions & { fetcher?: typeof fetch } = {},
  ): Promise<Live2DExpressionEngine> {
    return Live2DExpressionEngine.fromResourceSet(createResourceSetFromUrls(resources), options);
  }

  static async fromNodeDirectory(
    rootDir: string,
    options: Live2DExpressionEngineOptions = {},
  ): Promise<Live2DExpressionEngine> {
    const { scanLive2DResources, readNodeJsonResource } = await import("./node-resources.js");
    const resources = await scanLive2DResources(rootDir);
    return new Live2DExpressionEngine(
      await buildCharacterProfile(resources, {
        jsonLoader: (href) => readNodeJsonResource(href),
      }),
      options,
    );
  }

  generateByEmotion(
    emotion: EmotionName,
    options: GenerateEmotionOptions = {},
  ): ExpressionResult {
    return this.generateFromIntent({ emotion, ...options });
  }

  generateFromIntent(intentInput: EmotionIntent): ExpressionResult {
    const intent = normalizeIntent(intentInput);
    const { params, warnings } = clampParams(mapIntentToParams(intent), this.profile);
    return {
      emotion: intent.emotion,
      intensity: intent.intensity,
      durationMs: intent.durationMs,
      params,
      sourceIntent: intent,
      warnings,
    };
  }

  async generateFromText(text: string): Promise<ExpressionResult> {
    return this.generateFromIntent(await this.analyzer.analyze(text));
  }

  generateTimelineByEmotion(
    emotion: EmotionName,
    options: GenerateEmotionOptions = {},
  ): TimelineExpressionResult {
    return this.generateTimelineFromIntent({ emotion, ...options });
  }

  generateTimelineFromIntent(intentInput: EmotionIntent): TimelineExpressionResult {
    const intent = normalizeIntent(intentInput);
    const neutral = this.generateFromIntent({ emotion: "neutral", intensity: 1, durationMs: intent.durationMs });
    const target = this.generateFromIntent(intent);
    return buildTimeline({
      intent,
      neutralParams: neutral.params,
      targetParams: target.params,
      warnings: [...neutral.warnings, ...target.warnings],
    });
  }

  async generateTimelineFromText(text: string): Promise<TimelineExpressionResult> {
    return this.generateTimelineFromIntent(await this.analyzer.analyze(text));
  }

  generateNaturalTimelineByEmotion(
    emotion: EmotionName,
    options: GenerateNaturalTimelineOptions = {},
  ): TimelineExpressionResult {
    return this.generateNaturalTimelineFromIntent({ emotion, ...options }, options);
  }

  generateNaturalTimelineFromIntent(
    intentInput: EmotionIntent,
    options: NaturalMotionOptions = {},
  ): TimelineExpressionResult {
    const plan = createNaturalMotionPlan(intentInput, options);
    const warnings = new Set<string>();
    const keyframes = plan.steps.map((step) => {
      const result = this.generateFromIntent(step.intent);
      result.warnings.forEach((warning) => warnings.add(warning));
      const paramsWithMotion = applyNaturalParameterMotion(result.params, step, plan, options);
      const clamped = clampParams(paramsWithMotion, this.profile);
      clamped.warnings.forEach((warning) => warnings.add(warning));
      return {
        t: step.t,
        phase: step.phase,
        params: clamped.params,
      };
    });

    return {
      emotion: plan.intent.emotion,
      intensity: plan.intent.intensity,
      durationMs: plan.durationMs,
      keyframes: stabilizeNaturalMotionKeyframes(keyframes, options),
      warnings: [...warnings],
    };
  }

  async generateNaturalTimelineFromText(
    text: string,
    options: NaturalMotionOptions = {},
  ): Promise<TimelineExpressionResult> {
    return this.generateNaturalTimelineFromIntent(await this.analyzer.analyze(text), options);
  }
}
