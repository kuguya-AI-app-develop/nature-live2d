import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  Live2DExpressionEngine,
  Live2DExpressionOrchestrator,
  Live2DStreamingExpressionController,
  OpenAICompatibleEmotionAnalyzer,
  applyParamsToLive2DModel,
  blendEmotionIntents,
  createLive2DParameterApplier,
  createResourceSetFromUrls,
  estimateEmotionSignal,
  playTimelineOnLive2DModel,
  sampleTimeline,
  EmotionIntentStabilizer,
  type Live2DFrameCallback,
} from "../src-ts/index.js";
import { scanLive2DResources } from "../src-ts/node.js";

const YACHIYO_DIR = "yachiyo";

describe("TypeScript Live2DExpressionEngine", () => {
  it("scans a Node directory and generates safe emotion params", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const result = engine.generateByEmotion("shy", { intensity: 0.7 });

    expect(result.emotion).toBe("shy");
    expect(result.params.ParamAngleY).toBeCloseTo(-2.1);
    expect(result.params.ParamMouthForm).toBeCloseTo(0.315);
    expect(result.warnings).toEqual([]);
    expect(result.params.ParamHairPhysics_L1).toBeUndefined();
  });

  it("generates text timelines through the mock analyzer", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = await engine.generateTimelineFromText("八千代有点害羞地笑了一下");

    expect(timeline.emotion).toBe("shy");
    expect(timeline.keyframes.map((keyframe) => keyframe.t)).toEqual([0, 300, 900, 1200]);
    expect(timeline.keyframes[0].params.ParamMouthForm).toBeCloseTo(0);
    expect(timeline.keyframes[1].params.ParamEyeBallX).toBeCloseTo(0.25);
    expect(timeline.warnings).toEqual([]);
  });

  it("generates natural text timelines with duration-scaled intermediate motion", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const shortTimeline = await engine.generateNaturalTimelineFromText("八千代开心地笑了", {
      durationMs: 900,
      frameIntervalMs: 300,
    });
    const longTimeline = await engine.generateNaturalTimelineFromText("八千代开心地笑了", {
      durationMs: 2100,
      frameIntervalMs: 300,
    });

    expect(shortTimeline.emotion).toBe("happy");
    expect(shortTimeline.durationMs).toBe(900);
    expect(shortTimeline.keyframes[0].t).toBe(0);
    expect(shortTimeline.keyframes.at(-1)?.t).toBe(900);
    expect(shortTimeline.keyframes.some((keyframe) => keyframe.phase === "thinking")).toBe(true);
    expect(shortTimeline.keyframes.some((keyframe) => keyframe.phase === "reaction")).toBe(true);
    expect(longTimeline.keyframes.length).toBeGreaterThan(shortTimeline.keyframes.length);
    expect(shortTimeline.keyframes[0].params.ParamMouthForm).toBeCloseTo(0);
    expect(shortTimeline.keyframes.at(-1)?.params.ParamMouthForm).toBeGreaterThan(0.3);
  });

  it("keeps natural motion stable instead of alternating gaze and head every keyframe", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = await engine.generateNaturalTimelineFromText("诶，被这样夸奖有点不好意思。", {
      durationMs: 1600,
      frameIntervalMs: 120,
      liveliness: 0.7,
    });
    const eyeX = timeline.keyframes.map((keyframe) => keyframe.params.ParamEyeBallX ?? 0);
    const angleZ = timeline.keyframes.map((keyframe) => keyframe.params.ParamAngleZ ?? 0);

    expect(countSignFlips(eyeX, 0.08)).toBeLessThanOrEqual(1);
    expect(maxStepDelta(eyeX)).toBeLessThanOrEqual(0.14);
    expect(countSignFlips(angleZ, 0.8)).toBeLessThanOrEqual(1);
    expect(maxStepDelta(angleZ)).toBeLessThanOrEqual(1.5);
  });

  it("supports explicit absolute URL resources with a fetcher", async () => {
    const resources = createResourceSetFromUrls({
      rootUrl: "https://example.test/models/yachiyo/",
      model3Path: "八千代辉夜姬.model3.json",
      cdi3Path: "八千代辉夜姬.cdi3.json",
      physics3Path: "八千代辉夜姬.physics3.json",
      vtubePath: "八千代辉夜姬.vtube.json",
      exp3Paths: ["眼泪.exp3.json", "泪珠.exp3.json", "笑咪咪.exp3.json", "眯眯眼.exp3.json"],
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      const body = await readFile(join(YACHIYO_DIR, name), "utf8");
      return new Response(body, { status: 200 });
    });

    const engine = await Live2DExpressionEngine.fromResourceSet(resources, { fetcher });
    const result = engine.generateByEmotion("happy", { intensity: 1 });

    expect(result.params.ParamMouthForm).toBeCloseTo(0.65);
    expect(engine.profile.expressionPresets["笑咪咪"].ParamExpression_3).toBe(1);
    expect(fetcher).toHaveBeenCalled();
  });

  it("supports browser-style relative URL resources", () => {
    const resources = createResourceSetFromUrls({
      rootUrl: "/models/yachiyo/",
      model3Path: "八千代辉夜姬.model3.json",
      exp3Paths: ["眼泪.exp3.json"],
    });

    expect(resources.model3).toBe("/models/yachiyo/八千代辉夜姬.model3.json");
    expect(resources.exp3[0]).toBe("/models/yachiyo/眼泪.exp3.json");
  });

  it("samples and applies timeline params to a Live2D-like target", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = engine.generateTimelineByEmotion("happy", { intensity: 1 });
    const params = sampleTimeline(timeline, 300);
    const calls: Array<[string, number, number | undefined]> = [];

    applyParamsToLive2DModel(
      {
        setParameterValueById: (id, value, weight) => calls.push([id, value, weight]),
      },
      params,
      0.5,
    );

    expect(params.ParamMouthForm).toBeCloseTo(0.65);
    expect(calls).toContainEqual(["ParamMouthForm", 0.65, 0.5]);
  });

  it("interpolates timeline samples between keyframes", () => {
    const params = sampleTimeline(
      {
        emotion: "happy",
        intensity: 1,
        durationMs: 100,
        keyframes: [
          { t: 0, params: { ParamMouthForm: 0, ParamAngleZ: 0 } },
          { t: 100, params: { ParamMouthForm: 1, ParamAngleZ: 2 } },
        ],
        warnings: [],
      },
      50,
    );

    expect(params.ParamMouthForm).toBeCloseTo(0.5);
    expect(params.ParamAngleZ).toBeCloseTo(1);
  });

  it("applies params through a pixi-live2d-display internal core model", () => {
    const calls: Array<[string, number, number | undefined]> = [];
    const model = {
      internalModel: {
        coreModel: {
          setParameterValueById: (id: string, value: number, weight?: number) => calls.push([id, value, weight]),
        },
      },
    };

    applyParamsToLive2DModel(model, { ParamAngleX: 12 }, { runtime: "pixi-live2d-display", weight: 0.8 });

    expect(calls).toEqual([["ParamAngleX", 12, 0.8]]);
  });

  it("supports Cubism SDK id resolution and custom runtimes", () => {
    const cubismCalls: Array<[object, number, number | undefined]> = [];
    const idMap: Record<string, object> = { ParamAngleX: { id: "ParamAngleX" } };
    const cubismModel = {
      setParameterValueById: (id: object, value: number, weight?: number) => cubismCalls.push([id, value, weight]),
    };

    applyParamsToLive2DModel(cubismModel, { ParamAngleX: 9 }, {
      runtime: "cubism-sdk",
      weight: 0.25,
      resolveParameterId: (id) => idMap[id],
    });

    const customCalls: Array<[string, number, number]> = [];
    const customApplier = createLive2DParameterApplier({}, {
      runtime: "custom",
      setParameterValue: (id, value, weight) => customCalls.push([id, value, weight]),
    });
    customApplier.apply({ ParamMouthOpenY: 0.4 }, 0.6);

    expect(cubismCalls).toEqual([[idMap.ParamAngleX, 9, 0.25]]);
    expect(customApplier.runtime).toBe("custom");
    expect(customCalls).toEqual([["ParamMouthOpenY", 0.4, 0.6]]);
  });

  it("keeps neutral start for very short timelines", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = engine.generateTimelineByEmotion("happy", { intensity: 0.5, durationMs: 1 });

    expect(timeline.keyframes.map((keyframe) => keyframe.t)).toEqual([0, 1]);
    expect(timeline.keyframes[0].params.ParamMouthForm).toBeCloseTo(0);
    expect(timeline.keyframes[1].params.ParamMouthForm).toBeGreaterThan(0);
  });

  it("uses bound default frame callbacks when playing timelines", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = engine.generateTimelineByEmotion("happy", { intensity: 1, durationMs: 100 });
    const calls: Array<[string, number, number | undefined]> = [];
    const globalWithFrames = globalThis as typeof globalThis & {
      requestAnimationFrame?: (callback: Live2DFrameCallback) => number;
      cancelAnimationFrame?: (handle: number) => void;
    };
    const originalRequestFrame = globalWithFrames.requestAnimationFrame;
    const originalCancelFrame = globalWithFrames.cancelAnimationFrame;
    let scheduled: Live2DFrameCallback | null = null;
    let requestFrameThis: unknown = null;
    let cancelFrameThis: unknown = null;

    try {
      globalWithFrames.requestAnimationFrame = function requestFrame(this: typeof globalThis, callback: Live2DFrameCallback): number {
        requestFrameThis = this;
        scheduled = callback;
        return 42;
      };
      globalWithFrames.cancelAnimationFrame = function cancelFrame(this: typeof globalThis, _handle: number): void {
        cancelFrameThis = this;
      };

      const playback = playTimelineOnLive2DModel(
        { setParameterValueById: (id, value, weight) => calls.push([String(id), value, weight]) },
        timeline,
        { now: () => 50, weight: 0.7 },
      );
      scheduled?.(50);
      playback.stop();

      expect(requestFrameThis).toBe(globalThis);
      expect(cancelFrameThis).toBe(globalThis);
      expect(calls.some(([id]) => id === "ParamMouthForm")).toBe(true);
    } finally {
      globalWithFrames.requestAnimationFrame = originalRequestFrame;
      globalWithFrames.cancelAnimationFrame = originalCancelFrame;
    }
  });

  it("exposes Node scanning as a separate helper", async () => {
    const resources = await scanLive2DResources(YACHIYO_DIR);

    expect(resources.source).toBe("file");
    expect(resources.vtube?.endsWith(".vtube.json")).toBe(true);
    expect(resources.exp3).toHaveLength(4);
    expect(resources.ignored.some((path) => path.endsWith("items_pinned_to_model.json"))).toBe(true);
  });

  it("normalizes OpenAI-compatible analyzer JSON responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "```json\n{\"emotion\":\"shy\",\"intensity\":\"medium\",\"durationMs\":1600,\"specialExpression\":\"closed_eye_smile\",\"summary\":\"A shy happy reaction.\"}\n```",
        },
      }],
    }), { status: 200 }));
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetcher,
    });

    const intent = await analyzer.analyze("八千代被夸奖后害羞地笑了。");

    expect(intent.emotion).toBe("shy");
    expect(intent.intensity).toBeCloseTo(0.65);
    expect(intent.durationMs).toBe(1600);
    expect(intent.specialExpression).toBe("closed_eye_smile");
    expect(intent.summary).toBe("A shy happy reaction.");
    expect(fetcher).toHaveBeenCalledWith("https://llm.example.test/v1/chat/completions", expect.any(Object));
  });

  it("smooths streaming text updates before the final LLM intent", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const calls: Array<[string, number, number | undefined]> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const controller = new Live2DStreamingExpressionController({
      engine,
      model: {
        setParameterValueById: (id, value, weight) => calls.push([String(id), value, weight]),
      },
      runtime: "auto",
      weight: 0.5,
      smoothingMs: 100,
      minUpdateMs: 0,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    await controller.pushText("有点害羞，但很开心", { force: true });
    currentTime = 100;
    frameCallback?.(currentTime);
    controller.pushIntent({ emotion: "panic", intensity: 0.8 });
    currentTime = 200;
    frameCallback?.(currentTime);
    controller.stop();

    expect(controller.lastResult?.emotion).toBe("panic");
    expect(calls.some(([id]) => id === "ParamAngleX")).toBe(true);
    expect(calls.some(([id]) => id === "ParamMouthForm")).toBe(true);
  });

  it("coalesces streaming text analysis while a slow analyzer is pending", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const calls: Array<[string, number, number | undefined]> = [];
    const resolvers: Array<(intent: { emotion: "shy" | "happy"; intensity: number }) => void> = [];
    const analyzer = {
      analyze: vi.fn((_text: string) => new Promise<{ emotion: "shy" | "happy"; intensity: number }>((resolve) => {
        resolvers.push(resolve);
      })),
    };
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const controller = new Live2DStreamingExpressionController({
      engine,
      analyzer,
      model: {
        setParameterValueById: (id, value, weight) => calls.push([String(id), value, weight]),
      },
      runtime: "auto",
      minUpdateMs: 0,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    const first = controller.pushText("有点害羞", { force: true });
    const second = controller.pushText("还是很害羞", { force: true });
    const third = controller.pushText("现在开心起来了", { force: true });

    expect(analyzer.analyze).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeNull();
    await expect(third).resolves.toBeNull();

    resolvers[0]({ emotion: "shy", intensity: 0.5 });
    await first;
    await vi.waitFor(() => expect(analyzer.analyze).toHaveBeenCalledTimes(2));
    expect(analyzer.analyze).toHaveBeenLastCalledWith("现在开心起来了");

    resolvers[1]({ emotion: "happy", intensity: 0.7 });
    await vi.waitFor(() => expect(controller.lastResult?.emotion).toBe("happy"));
    currentTime = 100;
    frameCallback?.(currentTime);
    controller.stop();

    expect(calls.some(([id]) => id === "ParamMouthForm")).toBe(true);
  });

  it("estimates low-latency emotion signals from prompt and reply text", () => {
    const promptSignal = estimateEmotionSignal({
      promptText: "User: 生产环境突然进不去了，用户都在报错。",
      replyText: "",
      timestampMs: 0,
    });
    const replySignal = estimateEmotionSignal({
      promptText: "User: 刚才那段分析帮了大忙，你真的很可靠。",
      replyText: "诶，被这样夸奖有点不好意思，不过能帮上忙我很开心。",
      timestampMs: 100,
    });

    expect(promptSignal.source).toBe("prompt");
    expect(promptSignal.intent.emotion).toBe("panic");
    expect(promptSignal.confidence).toBeGreaterThan(0.5);
    expect(replySignal.source).toBe("reply");
    expect(replySignal.intent.emotion).toBe("shy");
    expect(replySignal.matched.length).toBeGreaterThan(0);
  });

  it("stabilizes short-lived emotion changes before switching", () => {
    const stabilizer = new EmotionIntentStabilizer({
      holdMs: 500,
      now: () => 0,
    });
    const first = stabilizer.push({
      source: "reply",
      intent: { emotion: "sad", intensity: 0.6 },
      confidence: 0.7,
      matched: ["失败"],
      held: false,
      timestampMs: 0,
      reason: "sad",
    });
    const held = stabilizer.push({
      source: "reply",
      intent: { emotion: "happy", intensity: 0.6 },
      confidence: 0.72,
      matched: ["开心"],
      held: false,
      timestampMs: 180,
      reason: "happy",
    });
    const switched = stabilizer.push({
      source: "reply",
      intent: { emotion: "happy", intensity: 0.6 },
      confidence: 0.9,
      matched: ["开心"],
      held: false,
      timestampMs: 700,
      reason: "happy",
    });

    expect(first.intent.emotion).toBe("sad");
    expect(held.intent.emotion).toBe("sad");
    expect(held.held).toBe(true);
    expect(switched.intent.emotion).toBe("happy");
  });

  it("blends final LLM intents without snapping neutral over a stream emotion", () => {
    const kept = blendEmotionIntents(
      { emotion: "sad", intensity: 0.6 },
      { emotion: "neutral", intensity: 0.3 },
      { amount: 0.8 },
    );
    const switched = blendEmotionIntents(
      { emotion: "panic", intensity: 0.6 },
      { emotion: "shy", intensity: 0.55, gaze: "down_right" },
      { amount: 0.7 },
    );

    expect(kept.emotion).toBe("sad");
    expect(kept.intensity).toBeGreaterThan(0.3);
    expect(switched.emotion).toBe("shy");
    expect(switched.gaze).toBe("down_right");
  });

  it("orchestrates stream signals and final calibration through a target", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const intents: string[] = [];
    const orchestrator = new Live2DExpressionOrchestrator({
      target: {
        pushIntent: (intent) => {
          intents.push(intent.emotion);
          return engine.generateFromIntent(intent);
        },
      },
      estimatorOptions: {
        durationMs: 900,
        now: () => 0,
      },
      stabilizerOptions: {
        holdMs: 0,
        now: () => 0,
      },
      finalBlend: 0.7,
    });

    const streaming = orchestrator.pushStreamText({
      promptText: "User: 居然一次跑通了，连我都没想到。",
      replyText: "哇，一次就跑通了，这也太厉害了吧！",
      timestampMs: 0,
    });
    const final = orchestrator.pushFinalIntent({ emotion: "happy", intensity: 0.65 });

    expect(streaming.signal.intent.emotion).toBe("surprised");
    expect(final.signal.intent.emotion).toBe("happy");
    expect(intents).toEqual(["surprised", "happy"]);
  });

  it("sustains subtle expression motion while waiting for final calibration", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const intents: Array<{ emotion: string; intensity?: number; gaze?: string | null }> = [];
    let now = 0;
    const orchestrator = new Live2DExpressionOrchestrator({
      target: {
        pushIntent: (intent) => {
          intents.push(intent);
          return engine.generateFromIntent(intent);
        },
      },
      estimatorOptions: {
        durationMs: 900,
        now: () => now,
      },
      stabilizerOptions: {
        holdMs: 0,
        now: () => now,
      },
    });

    expect(orchestrator.pushSustain()).toBeNull();

    const streaming = orchestrator.pushStreamText({
      promptText: "User: 你真的很可靠。",
      replyText: "诶，被这样夸奖有点不好意思。",
      timestampMs: now,
    });
    now = 900;
    const firstSustain = orchestrator.pushSustain({ intensityAmplitude: 0.05, now: () => now });
    now = 1800;
    const secondSustain = orchestrator.pushSustain({ intensityAmplitude: 0.05, now: () => now });

    expect(streaming.signal.intent.emotion).toBe("shy");
    expect(firstSustain?.signal.source).toBe("sustain");
    expect(firstSustain?.signal.intent.emotion).toBe("shy");
    expect(firstSustain?.signal.intent.intensity).not.toBe(streaming.signal.intent.intensity);
    expect(secondSustain?.signal.intent.gaze).not.toBe(firstSustain?.signal.intent.gaze);
    expect(intents.map((intent) => intent.emotion)).toEqual(["shy", "shy", "shy"]);
  });
});

function maxStepDelta(values: number[]): number {
  let max = 0;
  for (let index = 1; index < values.length; index += 1) {
    max = Math.max(max, Math.abs(values[index] - values[index - 1]));
  }
  return max;
}

function countSignFlips(values: number[], threshold: number): number {
  let flips = 0;
  let previousSign = 0;
  for (const value of values) {
    const sign = Math.abs(value) < threshold ? 0 : Math.sign(value);
    if (sign && previousSign && sign !== previousSign) flips += 1;
    if (sign) previousSign = sign;
  }
  return flips;
}
