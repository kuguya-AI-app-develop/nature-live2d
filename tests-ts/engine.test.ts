import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  Live2DExpressionEngine,
  Live2DExpressionOrchestrator,
  Live2DStreamingExpressionController,
  OpenAICompatibleEmotionAnalyzer,
  applyRealtimeMotionLayers,
  applyParamsToLive2DModel,
  blendEmotionIntents,
  buildCharacterProfile,
  createResourceSetFromModel3Url,
  createLive2DRealtimeMotionDirector,
  createLive2DParameterApplier,
  createResourceSetFromUrls,
  createRealtimeMotionLayerState,
  estimateEmotionSignal,
  getDefaultEmotionSignalPresets,
  inspectLive2DModelFromModel3Url,
  inspectLive2DModelUrls,
  playTimelineOnLive2DModel,
  resolveEmotionSignalPreset,
  resolveOpenAICompatibleProviderExtraBody,
  sampleTimeline,
  summarizeMotionCapability,
  EmotionIntentStabilizer,
  type EmotionIntent,
  type Live2DFrameCallback,
  type OpenAICompatibleEmotionStreamEvent,
  type RealtimeMotionFrameMeta,
} from "../src-ts/index.js";
import { inspectLive2DModelDirectory, scanLive2DResources } from "../src-ts/node.js";

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

  it("builds a generic parameter manifest from discovered model sources", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const manifest = engine.getParameterManifest();

    expect(manifest.totalCount).toBeGreaterThan(manifest.safeParameterIds.length);
    expect(manifest.safeParameterIds).toContain("ParamMouthFunnel");
    expect(manifest.safeParameterIds).toContain("ParamEyeSmile_Happy_L");
    expect(manifest.safeParameterIds).toContain("ParamEyeLSquint");
    expect(manifest.safeParameterIds).toContain("ParamMouthShape");
    expect(manifest.safeParameterIds).toContain("ParamEyeCircles");
    expect(manifest.safeParameterIds).toContain("ParamPupilQuake_L1");
    expect(manifest.safeParameterIds).toContain("ParamTearDown_1");
    expect(manifest.safeParameterIds).toContain("fire");
    expect(manifest.safeParameterIds).toContain("ParamExpression_3");
    expect(manifest.blockedParameterIds).toContain("ParamHairPhysics_L1");
    expect(manifest.byRole.mouth).toContain("ParamTongueOut");
    expect(manifest.entries.ParamMouthFunnel.sources).toContain("vtube");
    expect(manifest.entries.ParamExpression_3.expressionPresets).toContain("笑咪咪");
    expect(manifest.entries.ParamHairPhysics_L1.reason).toContain("physics");
  });

  it("derives controls from a custom model instead of injecting Yachiyo controls", async () => {
    const profile = await buildMinimalCustomProfile();

    expect(profile.mainControls).toEqual(["ParamAngleX", "ParamExpression_9", "ParamMouthOpenY"]);
    expect(profile.mainControls).not.toContain("ParamTongueOut");
    expect(profile.parameters.ParamExpression_9.range?.source).toBe("expression_fallback");
  });

  it("summarizes model motion capability from the parameter manifest", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const capability = engine.getMotionCapability();

    expect(capability.score).toBeGreaterThan(0.85);
    expect(capability.availableFeatures).toContain("mouthFunnel");
    expect(capability.availableFeatures).toContain("expressionLayer");
    expect(capability.byFeature.mouthOpen).toEqual(["ParamMouthOpenY"]);
    expect(capability.missingCoreFeatures).toEqual([]);
    expect(summarizeMotionCapability(capability)).toContain("features=");
  });

  it("adapts generated params to a custom model capability without warning spam", async () => {
    const engine = new Live2DExpressionEngine(await buildMinimalCustomProfile());
    const capability = engine.getMotionCapability();
    const happy = engine.generateByEmotion("happy", { intensity: 1 });
    const teasing = engine.generateByEmotion("teasing", { intensity: 1 });
    const timeline = engine.generateNaturalTimelineByEmotion("happy", {
      durationMs: 900,
      frameIntervalMs: 300,
    });

    expect(capability.availableFeatures).toEqual(["head", "mouthOpen", "expressionLayer"]);
    expect(capability.missingCoreFeatures).toEqual(["gaze", "eyeOpen", "brow", "mouthForm"]);
    expect(happy.warnings).toEqual([]);
    expect(Object.keys(happy.params).sort()).toEqual(["ParamAngleX", "ParamMouthOpenY"]);
    expect(happy.params.ParamMouthOpenY).toBeGreaterThan(0.3);
    expect(teasing.params.ParamMouthOpenY).toBeGreaterThan(0.1);
    expect(teasing.params.ParamTongueOut).toBeUndefined();
    expect(timeline.warnings).toEqual([]);
    expect(timeline.keyframes.every((keyframe) =>
      Object.keys(keyframe.params).every((id) => ["ParamAngleX", "ParamMouthOpenY"].includes(id)),
    )).toBe(true);
  });

  it("inspects a Node model directory before default motion is enabled", async () => {
    const report = await inspectLive2DModelDirectory(YACHIYO_DIR);

    expect(report.defaultMotionUsable).toBe(true);
    expect(report.strategy).toBe("full");
    expect(report.capability.score).toBeGreaterThan(0.85);
    expect(report.manifest.safeParameterIds).toContain("ParamMouthFunnel");
    expect(report.recommendations[0]).toContain("Default realtime");
  });

  it("builds an inspection report for explicitly declared browser URLs", async () => {
    const profile = await buildMinimalCustomProfile();
    const report = await inspectLive2DModelUrls({
      rootUrl: "/models/custom/",
      model3Path: "custom.model3.json",
      vtubePath: "custom.vtube.json",
      exp3Paths: ["smile.exp3.json"],
    }, {
      jsonLoader: async (href, resources) => {
        if (href.endsWith("custom.model3.json")) return { Version: 3, FileReferences: {} };
        if (href.endsWith("custom.vtube.json")) {
          return {
            Name: "Custom",
            ParameterSettings: [
              { OutputLive2D: "ParamAngleX", OutputRangeLower: -20, OutputRangeUpper: 20 },
              { OutputLive2D: "ParamMouthOpenY", OutputRangeLower: 0, OutputRangeUpper: 1 },
            ],
          };
        }
        if (href.endsWith("smile.exp3.json")) return { Parameters: [{ Id: "ParamExpression_9", Value: 1 }] };
        throw new Error(`unexpected ${href} ${resources.root}`);
      },
    });

    expect(report.characterName).toBe(profile.characterName);
    expect(report.defaultMotionUsable).toBe(true);
    expect(report.strategy).toBe("basic");
    expect(report.capability.missingCoreFeatures).toContain("mouthForm");
    expect(report.issues.map((issue) => issue.code)).toContain("missing_cdi_metadata");
  });

  it("imports browser model resources from model3 FileReferences", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      if (name === "custom.model3.json") {
        return jsonResponse({
          Version: 3,
          FileReferences: {
            DisplayInfo: "custom.cdi3.json",
            Physics: "custom.physics3.json",
            Expressions: [{ Name: "smile", File: "smile.exp3.json" }],
          },
        });
      }
      if (name === "custom.vtube.json") {
        return jsonResponse({
          Name: "Model3 Custom",
          ParameterSettings: [
            { OutputLive2D: "ParamAngleX", OutputRangeLower: -30, OutputRangeUpper: 30 },
            { OutputLive2D: "ParamMouthOpenY", OutputRangeLower: 0, OutputRangeUpper: 1 },
          ],
        });
      }
      if (name === "custom.cdi3.json") {
        return jsonResponse({
          Parameters: [
            { Id: "ParamAngleX", GroupId: "head", Name: "Head X" },
            { Id: "ParamMouthOpenY", GroupId: "mouth", Name: "Mouth Open" },
          ],
        });
      }
      if (name === "custom.physics3.json") return jsonResponse({ PhysicsSettings: [] });
      if (name === "smile.exp3.json") return jsonResponse({ Parameters: [{ Id: "ParamExpression_9", Value: 1 }] });
      return new Response("not found", { status: 404 });
    });

    const resources = await createResourceSetFromModel3Url({
      rootUrl: "https://example.test/models/custom/",
      model3Path: "custom.model3.json",
      vtubePath: "custom.vtube.json",
    }, fetcher);
    const report = await inspectLive2DModelFromModel3Url({
      rootUrl: "https://example.test/models/custom/",
      model3Path: "custom.model3.json",
      vtubePath: "custom.vtube.json",
    }, { fetcher });
    const engine = await Live2DExpressionEngine.fromModel3Url({
      rootUrl: "https://example.test/models/custom/",
      model3Path: "custom.model3.json",
      vtubePath: "custom.vtube.json",
    }, { fetcher });

    expect(resources.cdi3).toBe("https://example.test/models/custom/custom.cdi3.json");
    expect(resources.physics3).toBe("https://example.test/models/custom/custom.physics3.json");
    expect(resources.exp3).toEqual(["https://example.test/models/custom/smile.exp3.json"]);
    expect(report.characterName).toBe("Model3 Custom");
    expect(report.capability.byFeature.mouthOpen).toEqual(["ParamMouthOpenY"]);
    expect(engine.getMotionCapability().availableFeatures).toContain("mouthOpen");
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

  it("scales natural timeline micro motion with expressiveness", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const restrained = engine.generateNaturalTimelineByEmotion("happy", {
      durationMs: 1500,
      frameIntervalMs: 150,
      liveliness: 0.7,
      stability: 0.45,
      expressiveness: 0.7,
    });
    const vivid = engine.generateNaturalTimelineByEmotion("happy", {
      durationMs: 1500,
      frameIntervalMs: 150,
      liveliness: 0.7,
      stability: 0.45,
      expressiveness: 1.6,
    });
    const maxBodyMotion = (timeline: TimelineExpressionResult) =>
      Math.max(...timeline.keyframes.map((keyframe) => Math.abs(keyframe.params.ParamBodyAngleX ?? 0)));

    expect(maxBodyMotion(vivid)).toBeGreaterThan(maxBodyMotion(restrained));
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

    expect(result.params.ParamMouthForm).toBeCloseTo(0.9);
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

    expect(params.ParamMouthForm).toBeCloseTo(0.9);
    expect(calls).toContainEqual(["ParamMouthForm", 0.9, 0.5]);
  });

  it("uses richer safe mouth and breath controls in generated expressions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const happy = engine.generateByEmotion("happy", { intensity: 1 });
    const panic = engine.generateByEmotion("panic", { intensity: 1 });
    const teasing = engine.generateFromIntent({ emotion: "teasing", intensity: 1, mouth: "tongue" });

    expect(happy.params.ParamCheekPuff).toBeGreaterThan(0);
    expect(happy.params.ParamBreath).toBeCloseTo(0.5);
    expect(panic.params.ParamMouthFunnel).toBeGreaterThan(0);
    expect(panic.params.ParamMouthShrug).toBeGreaterThan(0);
    expect(panic.params.ParamPupilQuake_L1 ?? 0).toBeGreaterThan(0.5);
    expect(panic.params.ParamBreathPhysics_L ?? 0).toBeGreaterThan(0.5);
    expect(panic.params.ParamExpression_4 ?? 0).toBe(0);
    expect(teasing.params.ParamTongueOut).toBeGreaterThan(0.5);
  });

  it("uses model-specific safe facial detail parameters for vivid readable presets", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const excited = engine.generateFromIntent({ emotion: "happy", tone: "excited", intensity: 0.92 });
    const skeptical = engine.generateFromIntent({ emotion: "confused", tone: "skeptical", intensity: 0.9 });
    const frustrated = engine.generateFromIntent({ emotion: "angry", tone: "frustrated", intensity: 0.9 });

    expect(excited.params.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(0.45);
    expect(excited.params.ParamMouthShape ?? 0).toBeGreaterThan(0.25);
    expect(excited.params.ParamBodyAngleY ?? 0).toBeGreaterThan(1.2);
    expect(skeptical.params.ParamEyeLSquint ?? 0).toBeGreaterThan(0.25);
    expect(Math.abs(skeptical.params.ParamMouthX ?? 0)).toBeGreaterThan(0.2);
    expect(frustrated.params.ParamEyeSmile_Angry_L ?? 0).toBeGreaterThan(0.35);
    expect(frustrated.params.ParamMouthStraight ?? 0).toBeGreaterThan(0.2);
  });

  it("keeps expressive tone layers distinct instead of reusing one eye-closed preset", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const excited = engine.generateFromIntent({ emotion: "happy", tone: "excited", intensity: 0.94 });
    const proud = engine.generateFromIntent({ emotion: "happy", tone: "proud", intensity: 0.94 });
    const reassuring = engine.generateFromIntent({ emotion: "panic", tone: "reassuring", intensity: 0.9 });
    const nervous = engine.generateFromIntent({ emotion: "panic", tone: "nervous", intensity: 0.9 });

    expect(excited.params.ParamExpression_3 ?? 0).toBe(0);
    expect(excited.params.ParamEyeLOpen ?? 0).toBeGreaterThan(0.95);
    expect(proud.params.ParamExpression_3 ?? 0).toBe(1);
    expect(reassuring.params.ParamJawOpen ?? 0).toBeLessThan(0.18);
    expect(reassuring.params.ParamMouthOpenY ?? 0).toBeLessThan(0.24);
    expect(nervous.params.ParamJawOpen ?? 0).toBeGreaterThan(0.5);
  });

  it("produces visibly active high-intensity targets for strong emotions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const happy = engine.generateFromIntent({
      emotion: "happy",
      intensity: 1,
      specialExpression: "closed_eye_smile",
      mouth: "smile",
    });
    const panic = engine.generateByEmotion("panic", { intensity: 1 });

    expect(happy.params.ParamMouthForm).toBeGreaterThan(0.8);
    expect(happy.params.ParamMouthOpenY).toBeGreaterThan(0.3);
    expect(happy.params.ParamExpression_3).toBe(1);
    expect(panic.params.ParamMouthOpenY).toBeGreaterThan(1.0);
    expect(panic.params.ParamAngleZ).toBeGreaterThan(4);
    expect(panic.params.ParamEyeLOpen).toBeGreaterThan(1.2);
    expect(panic.params.ParamEyeROpen).toBeGreaterThan(1.2);
    expect(panic.params.ParamHide_EyesL1 ?? 0).toBe(0);
  });

  it("uses emotion tones to split one broad emotion into different readable poses", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const nervous = engine.generateFromIntent({ emotion: "panic", tone: "nervous", intensity: 0.85 });
    const reassuring = engine.generateFromIntent({ emotion: "panic", tone: "reassuring", intensity: 0.85 });
    const proud = engine.generateFromIntent({ emotion: "happy", tone: "proud", intensity: 0.85 });
    const playful = engine.generateFromIntent({ emotion: "happy", tone: "playful", intensity: 0.85 });

    expect(reassuring.params.ParamMouthOpenY).toBeLessThan(nervous.params.ParamMouthOpenY * 0.65);
    expect(reassuring.params.ParamMouthForm).toBeGreaterThan(nervous.params.ParamMouthForm);
    expect(playful.params.ParamMouthX ?? 0).toBeGreaterThan(proud.params.ParamMouthX ?? 0);
    expect(proud.params.ParamBodyAngleY ?? 0).toBeGreaterThan(0.4);
  });

  it("covers more immediate preset tones from short user and reply fragments", () => {
    const excited = estimateEmotionSignal("太棒了，发布成功了，真的太惊喜了！");
    const grateful = estimateEmotionSignal("谢谢你帮我稳住场面，真的帮大忙了。");
    const skeptical = estimateEmotionSignal("嗯？这个结果是不是哪里不太对？");
    const focused = estimateEmotionSignal("我马上开始定位问题，先看日志再回滚。");

    expect(excited.intent.tone).toBe("excited");
    expect(grateful.intent.tone).toBe("grateful");
    expect(skeptical.intent.tone).toBe("skeptical");
    expect(focused.intent.tone).toBe("focused");
    expect(Math.min(
      excited.intent.intensity ?? 0,
      grateful.intent.intensity ?? 0,
      skeptical.intent.intensity ?? 0,
      focused.intent.intensity ?? 0,
    )).toBeGreaterThan(0.4);
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
          content: "```json\n{\"emotion\":\"shy\",\"tone\":\"bashful\",\"intensity\":\"medium\",\"durationMs\":1600,\"specialExpression\":\"closed_eye_smile\",\"summary\":\"A shy happy reaction.\"}\n```",
        },
      }],
    }), { status: 200 }));
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      extraBody: { thinking: { type: "disabled" } },
      fetcher,
    });

    const intent = await analyzer.analyze("八千代被夸奖后害羞地笑了。");

    expect(intent.emotion).toBe("shy");
    expect(intent.tone).toBe("bashful");
    expect(intent.intensity).toBeCloseTo(0.65);
    expect(intent.durationMs).toBe(1600);
    expect(intent.specialExpression).toBe("closed_eye_smile");
    expect(intent.summary).toBe("A shy happy reaction.");
    expect(fetcher).toHaveBeenCalledWith("https://llm.example.test/v1/chat/completions", expect.any(Object));
  });

  it("adds provider presets without affecting generic OpenAI-compatible models", () => {
    expect(resolveOpenAICompatibleProviderExtraBody({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
    })).toEqual({});
    expect(resolveOpenAICompatibleProviderExtraBody({
      baseUrl: "https://provider.example.test/v1",
      model: "mimo-v2.5-pro",
    })).toEqual({ thinking: { type: "disabled" } });
    expect(resolveOpenAICompatibleProviderExtraBody({
      provider: "openai",
      baseUrl: "https://provider.example.test/v1",
      model: "mimo-v2.5-pro",
    })).toEqual({});
  });

  it("streams OpenAI-compatible emotion intents from partial JSON chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      openAIStreamChunk("reasoning", 'The user is worried. {"emotion":"慌张","tone":"nervous","intensity":4,'),
      openAIStreamChunk("reasoning", '"durationMs":900,"summary":"Immediate concern."}\n{"emotion":"sad",'),
      openAIStreamChunk("content", '"intensity":48,"durationMs":1200,"summary":"Soft empathy."}\n'),
      "data: [DONE]\n\n",
    ];
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }), { status: 200 }));
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      extraBody: { thinking: { type: "disabled" } },
      fetcher,
    });

    const events: OpenAICompatibleEmotionStreamEvent[] = [];
    for await (const event of analyzer.stream("User: 生产环境突然进不去了。")) {
      events.push(event);
    }

    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? "{}")) as {
      stream?: boolean;
      thinking?: { type?: string };
    };
    expect(requestBody.stream).toBe(true);
    expect(requestBody.thinking?.type).toBe("disabled");
    expect(events.map((event) => event.intent.emotion)).toEqual(["panic", "sad"]);
    expect(events[0]?.intent.tone).toBe("nervous");
    expect(events[0]?.intent.intensity).toBeCloseTo(0.8);
    expect(events[0]?.intent.summary).toBe("Immediate concern.");
    expect(events[1]?.intent.intensity).toBeCloseTo(0.48);
    expect(events[1]?.intent.durationMs).toBe(1200);
  });

  it("keeps reasoning deltas when content is an empty string", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            content: "",
            reasoning_content: '{"emotion":"惊喜","intensity":85,',
          },
        }],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{
          delta: {
            content: "",
            reasoning_content: '"durationMs":900,"summary":"Immediate delight."}',
          },
        }],
      })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }), { status: 200 }));
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetcher,
    });

    const events: OpenAICompatibleEmotionStreamEvent[] = [];
    for await (const event of analyzer.stream("User: 抽到了红包，太惊喜了。")) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.intent.emotion).toBe("surprised");
    expect(events[0]?.intent.intensity).toBeCloseTo(0.85);
    expect(events[0]?.intent.summary).toBe("Immediate delight.");
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

  it("starts realtime director motion before assistant text exists", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "请帮我继续看看这个方案。" });
    currentTime = 80;
    frameCallback?.(currentTime);
    director.stop();

    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[0]?.meta.phase).toBe("thinking");
    expect(frames[0]?.meta.source).toBe("idle");
    expect(Object.keys(frames[0]?.params ?? {})).toContain("ParamAngleX");
    expect(Object.keys(frames[0]?.params ?? {})).toContain("ParamBreath");
  });

  it("reacts to assistant deltas locally before semantic analysis", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      smoothingMs: 50,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "谢谢你帮我。" });
    const meta = director.pushAssistantDelta("诶，被这样夸奖有点不好意思。");
    currentTime = 100;
    frameCallback?.(currentTime);
    director.stop();

    const latest = frames.at(-1);
    expect(meta?.source).toBe("local");
    expect(meta?.emotion).toBe("shy");
    expect(latest?.meta.emotion).toBe("shy");
    expect(latest?.params.ParamMouthForm ?? 0).toBeGreaterThan(0);
  });

  it("keeps emitting frames while semantic analysis is pending", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let resolveIntent: ((intent: EmotionIntent) => void) | null = null;
    const analyzer = {
      analyze: vi.fn(() => new Promise<EmotionIntent>((resolve) => {
        resolveIntent = resolve;
      })),
    };
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: analyzer,
      onFrame: (params, meta) => frames.push({ params, meta }),
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "刚才那段分析帮了大忙，你真的很可靠。" });
    const meta = director.pushAssistantDelta("诶，被这样夸奖有点不好意思。");
    const frameCount = frames.length;
    currentTime = 120;
    frameCallback?.(currentTime);
    resolveIntent?.({ emotion: "shy", intensity: 0.72 });
    await flushMicrotasks();
    director.stop();

    expect(analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(meta?.source).toBe("local");
    expect(meta?.semanticPending).toBe(true);
    expect(frames.length).toBeGreaterThan(frameCount);
    expect(frames.some((frame) => frame.meta.semanticPending)).toBe(true);
    expect(director.lastMeta?.source).toBe("semantic");
  });

  it("consumes streamed semantic intents while assistant chunks are still arriving", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const analyzer = {
      analyze: vi.fn(async (): Promise<EmotionIntent> => ({ emotion: "neutral", intensity: 0.2 })),
      async *stream(): AsyncGenerator<{ type: "intent"; intent: EmotionIntent }> {
        yield { type: "intent", intent: { emotion: "happy", tone: "excited", intensity: 0.76, mouth: "smile" } };
        yield { type: "intent", intent: { emotion: "teasing", tone: "amused", intensity: 0.84, mouth: "smile" } };
      },
    };
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: analyzer,
      onFrame: (params, meta) => frames.push({ params, meta }),
      semanticIntervalMs: 150,
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "今天终于发布成功了。" });
    director.pushAssistantDelta("太好了，终于顺利了。");
    await vi.waitFor(() => expect(director.lastMeta?.tone).toBe("amused"));
    director.stop();

    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(frames.some((frame) =>
      frame.meta.source === "semantic"
      && frame.meta.tone === "excited"
      && frame.meta.presetId === "happy_excited",
    )).toBe(true);
    expect(director.lastMeta?.source).toBe("semantic");
    expect(director.lastMeta?.emotion).toBe("teasing");
    expect(director.lastMeta?.presetId).toBe("teasing_amused");
    expect(director.lastMeta?.semanticPresetId).toBe("teasing_amused");
  });

  it("uses the complete assistant reply for final realtime semantic calibration", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const analyzer = {
      analyze: vi.fn(async (_text: string): Promise<EmotionIntent> => ({ emotion: "sad", intensity: 0.76, brows: "worried" })),
    };
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: analyzer,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "请根据回复做表情。" });
    const local = director.pushAssistantDelta("刚才确实很开心");
    director.finishAssistantText();
    await vi.waitFor(() => expect(director.lastMeta?.source).toBe("semantic"));
    director.stop();

    expect(local?.emotion).toBe("happy");
    expect(analyzer.analyze).toHaveBeenCalledWith("User: 请根据回复做表情。\nAssistant: 刚才确实很开心");
    expect(director.lastMeta?.emotion).toBe("sad");
  });

  it("lets finished panic reactions settle into compatible worried semantic emotions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "" });
    const local = director.pushAssistantDelta("糟了，线上突然报错，用户一直在催。");
    director.finishAssistantText();
    const settled = director.pushSemanticIntent({ emotion: "sad", intensity: 0.78, brows: "worried" });
    const blocked = director.pushSemanticIntent({ emotion: "shy", intensity: 0.78 });
    director.stop();

    expect(local?.emotion).toBe("panic");
    expect(settled.emotion).toBe("sad");
    expect(blocked.semanticEmotion).toBe("shy");
    expect(blocked.emotion).toBe("sad");
  });

  it("damps finished panic semantic intensity after calming assistant replies", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      smoothingMs: 16,
      stability: 0,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "线上报错了。" });
    director.pushAssistantDelta("先别慌，深呼吸，我们一步步检查日志和回滚方案。");
    director.finishAssistantText();
    const semantic = director.pushSemanticIntent({ emotion: "panic", intensity: 1 });
    for (let i = 0; i < 16; i += 1) {
      currentTime += 80;
      frameCallback?.(currentTime);
    }
    director.stop();

    expect(semantic.emotion).toBe("panic");
    expect(semantic.tone).toBe("reassuring");
    expect(frames.at(-1)?.params.ParamMouthOpenY ?? 0).toBeLessThan(0.95);
  });

  it("ignores stale semantic results after reset", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let resolveIntent: ((intent: EmotionIntent) => void) | null = null;
    const analyzer = {
      analyze: vi.fn(() => new Promise<EmotionIntent>((resolve) => {
        resolveIntent = resolve;
      })),
    };
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: analyzer,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "今天终于跑通了。" });
    director.pushAssistantDelta("好开心，终于顺利了。");
    director.reset();
    resolveIntent?.({ emotion: "happy", intensity: 0.8 });
    await flushMicrotasks();
    director.stop();

    expect(analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(director.lastMeta).toBeNull();
  });

  it("keeps high-priority local emotion over conflicting semantic calibration", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "" });
    const local = director.pushAssistantDelta("生产环境突然进不去了，用户都在报错。");
    const firstSemantic = director.pushSemanticIntent({ emotion: "shy", intensity: 0.75 });
    const secondSemantic = director.pushSemanticIntent({ emotion: "shy", intensity: 0.75 });
    director.stop();

    expect(local?.emotion).toBe("panic");
    expect(firstSemantic.source).toBe("semantic");
    expect(firstSemantic.semanticEmotion).toBe("shy");
    expect(firstSemantic.emotion).toBe("panic");
    expect(secondSemantic.emotion).toBe("panic");
  });

  it("switches realtime semantic flow and new-turn prompt reactions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "i just won 800 yuan surprise unexpected happy" });
    const surprise = director.pushSemanticIntent({ emotion: "surprised", intensity: 0.8 });
    const happy = director.pushSemanticIntent({ emotion: "happy", intensity: 0.8, specialExpression: "closed_eye_smile" });
    director.startTurn({ promptText: "you are reliable and this compliment makes me shy" });
    const shy = director.lastMeta;
    director.stop();

    expect(surprise.emotion).toBe("surprised");
    expect(happy.emotion).toBe("happy");
    expect(shy?.emotion).toBe("shy");
    expect(shy?.source).toBe("local");
  });

  it("lets playful semantic calibration override compatible shy local reactions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "my boss praised me and this compliment makes me shy" });
    const local = director.lastMeta;
    const teasing = director.pushSemanticIntent({ emotion: "teasing", intensity: 0.82 });
    director.stop();

    expect(local?.emotion).toBe("shy");
    expect(teasing.semanticEmotion).toBe("teasing");
    expect(teasing.emotion).toBe("teasing");
  });

  it("does not let incompatible semantic flow override high-priority local emotion", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "i failed my presentation and feel sad please comfort me" });
    const sad = director.pushSemanticIntent({ emotion: "sad", intensity: 0.75 });
    const shy = director.pushSemanticIntent({ emotion: "shy", intensity: 0.8 });
    director.stop();

    expect(sad.emotion).toBe("sad");
    expect(shy.semanticEmotion).toBe("shy");
    expect(shy.emotion).toBe("sad");
  });

  it("stages realtime emotion transitions over multiple frames", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      transitionMs: 620,
      smoothingMs: 80,
      layeredMotion: false,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    director.pushAssistantDelta("生产环境突然进不去了，用户都在报错。");
    currentTime = 40;
    frameCallback?.(currentTime);
    const earlyMouthOpen = frames.at(-1)?.params.ParamMouthOpenY ?? 0;
    currentTime = 620;
    frameCallback?.(currentTime);
    const lateMouthOpen = frames.at(-1)?.params.ParamMouthOpenY ?? 0;
    director.stop();

    expect(frames.some((frame) => frame.meta.emotion === "panic")).toBe(true);
    expect(earlyMouthOpen).toBeLessThan(0.08);
    expect(lateMouthOpen).toBeGreaterThan(earlyMouthOpen);
  });

  it("switches expression layers behind a short blink instead of a slow fade", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      transitionMs: 620,
      smoothingMs: 16,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    director.pushSemanticIntent({ emotion: "happy", intensity: 1, specialExpression: "closed_eye_smile" });
    currentTime = 150;
    frameCallback?.(currentTime);
    const beforeSwitch = frames.at(-1)?.params ?? {};
    currentTime = 280;
    frameCallback?.(currentTime);
    const afterSwitch = frames.at(-1)?.params ?? {};
    director.stop();

    expect(beforeSwitch.ParamExpression_3 ?? 0).toBeLessThan(0.15);
    expect(afterSwitch.ParamExpression_3 ?? 0).toBeGreaterThan(0.85);
    expect(Math.min(afterSwitch.ParamEyeLOpen ?? 1, afterSwitch.ParamEyeROpen ?? 1)).toBeLessThan(0.55);
  });

  it("adds visible body motion during realtime emotional reactions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      transitionMs: 420,
      smoothingMs: 60,
      stability: 0.72,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    director.pushAssistantDelta("生产环境突然进不去了，用户一直催，我真的慌了。");
    for (const time of [260, 520, 780, 1040]) {
      currentTime = time;
      frameCallback?.(currentTime);
    }
    director.stop();

    const bodyX = frames.map((frame) => Math.abs(frame.params.ParamBodyAngleX ?? 0));
    expect(Math.max(...bodyX)).toBeGreaterThan(0.8);
  });

  it("composes layered face, speech, and accent motion while streaming", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      transitionMs: 420,
      smoothingMs: 24,
      stability: 0.42,
      expressiveness: 1.7,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    director.pushAssistantDelta("太好了，终于发布成功了，我们真的做到了！");
    for (const time of [80, 160, 240, 320, 400]) {
      currentTime = time;
      frameCallback?.(currentTime);
    }
    director.stop();

    const speechFrames = frames.filter((frame) => frame.meta.layers.speech > 0.1);
    const mouthOpen = speechFrames.map((frame) => frame.params.ParamMouthOpenY ?? 0);
    expect(Math.max(...frames.map((frame) => frame.meta.layers.face))).toBeGreaterThan(0.45);
    expect(Math.max(...frames.map((frame) => frame.meta.layers.accent))).toBeGreaterThan(0.2);
    expect(speechFrames.length).toBeGreaterThan(1);
    expect(Math.max(...mouthOpen) - Math.min(...mouthOpen)).toBeGreaterThan(0.04);
  });

  it("exposes reusable realtime motion layer composition for host apps", () => {
    const base = {
      ParamMouthOpenY: 0.08,
      ParamJawOpen: 0,
      ParamMouthShape: 0,
      ParamCheek: 0.2,
      ParamEyeBallX: 0,
      ParamEyeBallY: 0,
      ParamAngleX: 0,
      ParamAngleY: 0,
      ParamBodyAngleY: 0,
      ParamEyeSmile_Happy_L: 0.2,
      ParamEyeSmile_Happy_R: 0.2,
    };
    const supported = new Set(Object.keys(base));
    const empty = createRealtimeMotionLayerState();
    const result = applyRealtimeMotionLayers(base, {
      intent: { emotion: "happy", tone: "excited", intensity: 0.82, durationMs: 900 },
      phase: "streaming",
      source: "local",
      elapsedMs: 240,
      transitionElapsedMs: 220,
      speechEnergy: 0.9,
      lastAssistantDeltaAgeMs: 40,
      expressiveness: 1.65,
      stability: 0.35,
      hasParam: (id) => supported.has(id),
      hasFeature: (feature) => ["gaze", "head", "body"].includes(feature),
    });

    expect(empty.speech).toBe(0);
    expect(result.layers.face).toBeGreaterThan(0.7);
    expect(result.layers.speech).toBeGreaterThan(0.5);
    expect(result.layers.accent).toBeGreaterThan(0.4);
    expect(result.params.ParamMouthOpenY).toBeGreaterThan(base.ParamMouthOpenY + 0.2);
    expect(result.params.ParamBodyAngleY).toBeGreaterThan(base.ParamBodyAngleY);
  });

  it("lets realtime expressiveness produce stronger readable poses and accents", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const collectFrames = (expressiveness: number) => {
      const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
      let currentTime = 0;
      let frameCallback: Live2DFrameCallback | null = null;
      const director = createLive2DRealtimeMotionDirector({
        engine,
        onFrame: (params, meta) => frames.push({ params, meta }),
        transitionMs: 420,
        smoothingMs: 40,
        stability: 0.55,
        expressiveness,
        now: () => currentTime,
        requestFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
        cancelFrame: () => {},
      });

      director.startTurn({ promptText: "" });
      director.pushAssistantDelta("今天发布顺利，我开心高兴到想笑。");
      for (const time of [120, 240, 360, 480, 600]) {
        currentTime = time;
        frameCallback?.(currentTime);
      }
      director.stop();
      return frames;
    };

    const restrained = collectFrames(0.7);
    const vivid = collectFrames(1.6);
    const maxPose = (frames: Array<{ params: Record<string, number> }>) =>
      Math.max(...frames.map((frame) => Math.abs(frame.params.ParamBodyAngleY ?? 0) + Math.abs(frame.params.ParamAngleY ?? 0)));

    expect(maxPose(vivid)).toBeGreaterThan(maxPose(restrained) + 0.4);
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
    expect(promptSignal.presetId).toBe("panic_nervous");
    expect(promptSignal.intent.presetId).toBe("panic_nervous");
    expect(promptSignal.confidence).toBeGreaterThan(0.5);
    expect(replySignal.source).toBe("reply");
    expect(replySignal.intent.emotion).toBe("shy");
    expect(replySignal.presetId).toBe("shy_bashful");
    expect(replySignal.matched.length).toBeGreaterThan(0);
  });

  it("exposes a reusable emotion preset catalog for host apps", () => {
    const presets = getDefaultEmotionSignalPresets();
    const presetIds = presets.map((preset) => preset.presetId);
    const excited = resolveEmotionSignalPreset({ emotion: "happy", tone: "excited" });
    const reassuring = resolveEmotionSignalPreset({ emotion: "sad", tone: "reassuring" });

    expect(presets.length).toBeGreaterThanOrEqual(30);
    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(presetIds).toContain("happy_excited");
    expect(presetIds).toContain("panic_reassuring");
    expect(presetIds).toContain("panic_startled");
    expect(presetIds).toContain("happy_relieved");
    expect(presetIds).toContain("confused_skeptical");
    expect(excited?.presetId).toBe("happy_excited");
    expect(reassuring?.presetId).toBe("sad_reassuring");
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function openAIStreamChunk(kind: "content" | "reasoning", value: string): string {
  const delta = kind === "content" ? { content: value } : { reasoning_content: value };
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function buildMinimalCustomProfile() {
  return buildCharacterProfile({
    root: "/models/custom",
    source: "url",
    vtube: "/models/custom/custom.vtube.json",
    exp3: ["/models/custom/smile.exp3.json"],
    ignored: [],
  }, {
    jsonLoader: async (href) => {
      if (href.endsWith("custom.vtube.json")) {
        return {
          Name: "Custom",
          ParameterSettings: [
            { OutputLive2D: "ParamAngleX", OutputRangeLower: -20, OutputRangeUpper: 20 },
            { OutputLive2D: "ParamMouthOpenY", OutputRangeLower: 0, OutputRangeUpper: 1 },
          ],
        };
      }
      return {
        Parameters: [
          { Id: "ParamExpression_9", Value: 1 },
        ],
      };
    },
  });
}
