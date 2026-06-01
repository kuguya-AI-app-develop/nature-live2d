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
  materializeEmotionSignalPreset,
  playTimelineOnLive2DModel,
  resolveEmotionSignalPreset,
  resolveMotionPerformanceStyle,
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
    expect(manifest.safeParameterIds).toContain("ParamMouthAngleModify_XL");
    expect(manifest.safeParameterIds).toContain("ParamMouthAngleModify_YU");
    expect(manifest.safeParameterIds).toContain("ParamEyeCircles");
    expect(manifest.safeParameterIds).toContain("ParamPupilQuake_L1");
    expect(manifest.safeParameterIds).toContain("ParamTearDown_1");
    expect(manifest.safeParameterIds).toContain("ParamTearDisappear_1");
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
    expect(timeline.keyframes[1].params.ParamEyeBallX).toBeGreaterThan(0.3);
    expect(timeline.keyframes[1].params.ParamEyeBallX).toBeLessThan(0.5);
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
    expect(teasing.params.ParamMouthAngleModify_XL ?? 0).toBeLessThan(-0.3);
    expect(teasing.params.ParamMouthAngleModify_XR ?? 0).toBeGreaterThan(0.2);
  });

  it("uses model-specific safe facial detail parameters for vivid readable presets", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const excited = engine.generateFromIntent({ emotion: "happy", tone: "excited", intensity: 0.92 });
    const skeptical = engine.generateFromIntent({ emotion: "confused", tone: "skeptical", intensity: 0.9 });
    const frustrated = engine.generateFromIntent({ emotion: "angry", tone: "frustrated", intensity: 0.9 });

    expect(excited.params.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(0.45);
    expect(excited.params.ParamMouthShape ?? 0).toBeGreaterThan(0.25);
    expect(excited.params.ParamMouthAngleModify_YU ?? 0).toBeGreaterThan(0.25);
    expect(excited.params.ParamBodyAngleY ?? 0).toBeGreaterThan(1.2);
    expect(skeptical.params.ParamEyeLSquint ?? 0).toBeGreaterThan(0.25);
    expect(Math.abs(skeptical.params.ParamMouthX ?? 0)).toBeGreaterThan(0.2);
    expect(skeptical.params.ParamMouthAngleModify_XL ?? 0).toBeLessThan(-0.2);
    expect(frustrated.params.ParamEyeSmile_Angry_L ?? 0).toBeGreaterThan(0.35);
    expect(frustrated.params.ParamMouthStraight ?? 0).toBeGreaterThan(0.2);
    expect(frustrated.params.ParamMouthAngleModify_YU ?? 0).toBeLessThan(-0.08);
  });

  it("keeps expressive tone layers distinct instead of reusing one eye-closed preset", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const excited = engine.generateFromIntent({ emotion: "happy", tone: "excited", intensity: 0.94 });
    const proud = engine.generateFromIntent({ emotion: "happy", tone: "proud", intensity: 0.94 });
    const reassuring = engine.generateFromIntent({ emotion: "panic", tone: "reassuring", intensity: 0.9 });
    const nervous = engine.generateFromIntent({ emotion: "panic", tone: "nervous", intensity: 0.9 });

    expect(excited.params.ParamExpression_3 ?? 0).toBe(0);
    expect(excited.params.ParamEyeLOpen ?? 0).toBeGreaterThan(0.95);
    expect(proud.params.ParamExpression_3 ?? 0).toBe(0);
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

  it("materializes preset defaults before mapping an explicit preset id", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const plain = engine.generateFromIntent({ emotion: "happy", intensity: 0.9 });
    const giddy = engine.generateFromIntent({
      emotion: "happy",
      presetId: "happy_giddy_bounce",
      intensity: 0.9,
    });

    expect(giddy.sourceIntent.tone).toBe("excited");
    expect(giddy.sourceIntent.facialStyle).toBe("radiant");
    expect(giddy.sourceIntent.head).toBe("raised");
    expect(giddy.params.ParamMouthOpenY ?? 0).toBeGreaterThan(plain.params.ParamMouthOpenY ?? 0);
    expect(giddy.params.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(plain.params.ParamEyeSmile_Happy_L ?? 0);
    expect(maxParamDistance(giddy.params, plain.params)).toBeGreaterThan(0.6);
  });

  it("amplifies semantic tone contours more than broad emotion-only mapping", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const broadHappy = engine.generateFromIntent({ emotion: "happy", intensity: 0.72 });
    const excited = engine.generateFromIntent({ emotion: "happy", tone: "excited", intensity: 0.72 });
    const broadSad = engine.generateFromIntent({ emotion: "sad", intensity: 0.72 });
    const concerned = engine.generateFromIntent({ emotion: "sad", tone: "concerned", intensity: 0.72 });

    expect(excited.params.ParamMouthOpenY ?? 0).toBeGreaterThan((broadHappy.params.ParamMouthOpenY ?? 0) + 0.18);
    expect(excited.params.ParamCheek ?? 0).toBeGreaterThan(broadHappy.params.ParamCheek ?? 0);
    expect(concerned.params.ParamBrowLY ?? 0).toBeGreaterThan((broadSad.params.ParamBrowLY ?? 0) + 0.18);
    expect(concerned.params.ParamEyeLOpen ?? 1).toBeLessThan(broadSad.params.ParamEyeLOpen ?? 1);
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

  it("can force runtime writes to core or all available parameter setters", () => {
    const calls: string[] = [];
    const model = {
      setParameterValueById: (id: string, value: number, weight?: number) => calls.push(`model:${id}:${value}:${weight}`),
      coreModel: {
        setParameterValueById: (id: string, value: number, weight?: number) => calls.push(`core:${id}:${value}:${weight}`),
      },
      internalModel: {
        coreModel: {
          setParameterValueById: (id: string, value: number, weight?: number) => calls.push(`pixi:${id}:${value}:${weight}`),
        },
      },
    };

    const coreApplier = createLive2DParameterApplier(model, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
      weight: 0.7,
    });
    coreApplier.apply({ ParamMouthForm: 0.8 });
    const allApplier = createLive2DParameterApplier(model, {
      runtime: "pixi-live2d-display",
      applyTarget: "all",
      weight: 0.9,
    });
    allApplier.apply({ ParamMouthOpenY: 0.4 });

    expect(coreApplier.applyTarget).toBe("core");
    expect(allApplier.applyTarget).toBe("all");
    expect(calls).toEqual([
      "pixi:ParamMouthForm:0.8:0.7",
      "model:ParamMouthOpenY:0.4:0.9",
      "pixi:ParamMouthOpenY:0.4:0.9",
      "core:ParamMouthOpenY:0.4:0.9",
    ]);
  });

  it("can drive every pixi-visible setter immediately for stronger realtime overlays", () => {
    const calls: string[] = [];
    const model = {
      setParameterValueById: (id: string, value: number, weight?: number) => calls.push(`model:${id}:${value}:${weight}`),
      internalModel: {
        coreModel: {
          setParameterValueById: (id: string, value: number, weight?: number) => calls.push(`pixi:${id}:${value}:${weight}`),
        },
      },
    };
    const applier = createLive2DParameterApplier(model, {
      runtime: "pixi-live2d-display",
      applyTarget: "all",
      applyTiming: "immediate",
      weight: 1,
    });

    applier.apply({ ParamMouthForm: 0.9, ParamEyeSmile_Happy_L: 1 });

    expect(applier.applyTarget).toBe("all");
    expect(applier.applyTiming).toBe("immediate");
    expect(calls).toEqual([
      "model:ParamMouthForm:0.9:1",
      "pixi:ParamMouthForm:0.9:1",
      "model:ParamEyeSmile_Happy_L:1:1",
      "pixi:ParamEyeSmile_Happy_L:1:1",
    ]);
  });

  it("can read and probe the selected Live2D runtime target", () => {
    const values = new Map<string, number>();
    const model = {
      internalModel: {
        coreModel: {
          setParameterValueById: (id: string, value: number) => values.set(id, value),
          getParameterValueById: (id: string) => values.get(id) ?? 0,
        },
      },
    };
    const applier = createLive2DParameterApplier(model, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
    });
    const { probe } = applier;

    const result = probe({ ParamMouthForm: 0.75 });

    expect(applier.read("ParamMouthForm")).toBe(0.75);
    expect(result).toEqual([{
      id: "ParamMouthForm",
      requestedValue: 0.75,
      actualValue: 0.75,
      difference: 0,
      tolerance: 0.035,
      status: "matched",
    }]);
  });

  it("reports mismatched and unreadable Live2D runtime probes", () => {
    const mismatchApplier = createLive2DParameterApplier({
      internalModel: {
        coreModel: {
          setParameterValueById: () => {},
          getParameterValueById: () => 0.1,
        },
      },
    }, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
    });
    const unreadableApplier = createLive2DParameterApplier({
      internalModel: {
        coreModel: {
          setParameterValueById: () => {},
        },
      },
    }, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
    });

    expect(mismatchApplier.probe({ ParamMouthForm: 0.75 })[0]).toMatchObject({
      id: "ParamMouthForm",
      requestedValue: 0.75,
      actualValue: 0.1,
      status: "mismatch",
    });
    expect(unreadableApplier.probe({ ParamMouthForm: 0.75 })[0]).toEqual({
      id: "ParamMouthForm",
      requestedValue: 0.75,
      tolerance: 0.035,
      status: "unreadable",
    });
  });

  it("buffers pixi runtime overlay params until beforeModelUpdate", () => {
    const calls: Array<[string, number, number | undefined]> = [];
    const listeners = new Map<string, () => void>();
    const model = {
      internalModel: {
        on: (event: string, listener: () => void) => listeners.set(event, listener),
        off: (event: string) => listeners.delete(event),
        coreModel: {
          setParameterValueById: (id: string, value: number, weight?: number) => calls.push([id, value, weight]),
        },
      },
    };
    const applier = createLive2DParameterApplier(model, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
      applyTiming: "before-model-update",
      weight: 0.85,
    });

    applier.apply({ ParamMouthForm: 0.75 });
    expect(applier.applyTiming).toBe("before-model-update");
    expect(calls).toEqual([]);

    listeners.get("beforeModelUpdate")?.();
    expect(calls).toEqual([["ParamMouthForm", 0.75, 0.85]]);

    applier.dispose();
    expect(listeners.has("beforeModelUpdate")).toBe(false);
  });

  it("requires a runtime hook for deferred beforeModelUpdate overlays", () => {
    expect(() => createLive2DParameterApplier({
      internalModel: {
        coreModel: {
          setParameterValueById: () => {},
        },
      },
    }, {
      runtime: "pixi-live2d-display",
      applyTarget: "core",
      applyTiming: "before-model-update",
    })).toThrow(/before-model-update/);
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
          content: "```json\n{\"emotion\":\"shy\",\"tone\":\"bashful\",\"presetId\":\"shy_cover_face\",\"facialStyle\":\"flustered\",\"motionStyle\":\"squirm\",\"intensity\":\"medium\",\"durationMs\":1600,\"specialExpression\":\"closed_eye_smile\",\"summary\":\"A shy happy reaction.\"}\n```",
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
    expect(intent.presetId).toBe("shy_cover_face");
    expect(intent.facialStyle).toBe("flustered");
    expect(intent.motionStyle).toBe("squirm");
    expect(intent.intensity).toBeCloseTo(0.65);
    expect(intent.durationMs).toBe(1600);
    expect(intent.specialExpression).toBe("closed_eye_smile");
    expect(intent.summary).toBe("A shy happy reaction.");
    expect(fetcher).toHaveBeenCalledWith("https://llm.example.test/v1/chat/completions", expect.any(Object));
    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    expect(requestBody.messages?.[0]?.content).toContain("Allowed presetId values");
    expect(requestBody.messages?.[0]?.content).toContain("Allowed presetId performance catalog");
    expect(requestBody.messages?.[0]?.content).toContain("shy_cover_face");
    expect(requestBody.messages?.[0]?.content).toContain("motionStyle is optional");
    expect(requestBody.messages?.[0]?.content).toContain("teasing_reassuring_smile=teasing/reassuring/gentle/soft_sway/none");
  });

  it("maps tone-like analyzer emotions back to readable broad emotions", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "{\"emotion\":\"concerned\",\"tone\":\"reassuring\",\"intensity\":0.8}",
        },
      }],
    }), { status: 200 }));
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetcher,
    });

    const intent = await analyzer.analyze("线上故障已经定位，先安抚用户。");

    expect(intent.emotion).toBe("sad");
    expect(intent.tone).toBe("reassuring");
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

  it("maps tone-like streamed emotions without weakening them to neutral", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      openAIStreamChunk("content", '{"emotion":"reassuring","tone":"reassuring","intensity":0.72}\n'),
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
    for await (const event of analyzer.stream("User: 别慌，问题已经定位。")) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.intent.emotion).toBe("sad");
    expect(events[0]?.intent.tone).toBe("reassuring");
  });

  it("keeps streamed preset ids only when they are in the default catalog", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      openAIStreamChunk("content", '{"emotion":"happy","presetId":"happy_giddy_bounce","intensity":0.82}\n'),
      openAIStreamChunk("content", '{"emotion":"happy","presetId":"made_up_expression","intensity":0.82}\n'),
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
    for await (const event of analyzer.stream("Assistant: 开心到坐不住，整个人想蹦起来。")) {
      events.push(event);
    }

    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    expect(requestBody.messages?.[0]?.content).toContain("Allowed presetId values");
    expect(requestBody.messages?.[0]?.content).toContain("happy_giddy_bounce");
    expect(events.map((event) => event.intent.presetId)).toEqual(["happy_giddy_bounce", null]);
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

  it("disposes realtime pixi overlay hooks when a director is replaced", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const listeners = new Map<string, () => void>();
    const model = {
      internalModel: {
        on: (event: string, listener: () => void) => listeners.set(event, listener),
        off: (event: string) => listeners.delete(event),
        coreModel: {
          setParameterValueById: () => {},
        },
      },
    };
    const director = createLive2DRealtimeMotionDirector({
      engine,
      model,
      runtime: "pixi-live2d-display",
      applyTarget: "core",
      applyTiming: "before-model-update",
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    expect(listeners.has("beforeModelUpdate")).toBe(true);
    director.dispose();
    expect(listeners.has("beforeModelUpdate")).toBe(false);
    expect(() => director.startTurn({ promptText: "restart" })).toThrow(/disposed/);
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

  it("makes strong semantic face contours readable during the first transition beat", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    let latestParams: Record<string, number> = {};
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params) => {
        latestParams = params;
      },
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    director.pushSemanticIntent({ emotion: "happy", tone: "excited", intensity: 0.94 });
    for (currentTime = 16; currentTime <= 160; currentTime += 16) frameCallback?.(currentTime);
    director.stop();

    expect(latestParams.ParamMouthForm ?? 0).toBeGreaterThan(0.32);
    expect(latestParams.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(0.5);
    expect(latestParams.ParamCheek ?? 0).toBeGreaterThan(0.65);
  });

  it("makes playful and sleepy contours readable during the first transition beat", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const run = (intent: EmotionIntent) => {
      let currentTime = 0;
      let frameCallback: Live2DFrameCallback | null = null;
      let latestParams: Record<string, number> = {};
      const director = createLive2DRealtimeMotionDirector({
        engine,
        onFrame: (params) => {
          latestParams = params;
        },
        now: () => currentTime,
        requestFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
        cancelFrame: () => {},
      });
      director.startTurn({ promptText: "" });
      director.pushSemanticIntent(intent);
      for (currentTime = 16; currentTime <= 160; currentTime += 16) frameCallback?.(currentTime);
      director.stop();
      return latestParams;
    };

    const playful = run({ emotion: "teasing", tone: "amused", intensity: 0.9 });
    const sleepy = run({ emotion: "sleepy", tone: "tender", intensity: 0.82 });

    expect(playful.ParamEyeLSquint ?? 0).toBeGreaterThan(0.42);
    expect(playful.ParamMouthX ?? 0).toBeGreaterThan(0.35);
    expect(sleepy.ParamEyeLOpen ?? 1).toBeLessThan(0.58);
    expect(sleepy.ParamEyeLSquint ?? 0).toBeGreaterThan(0.2);
    expect(sleepy.ParamMouthFunnel ?? 0).toBeGreaterThan(0.08);
  });

  it("keeps excited happiness open-eyed unless a celebration preset requests closed eyes", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const run = (intent: EmotionIntent) => {
      let currentTime = 0;
      let frameCallback: Live2DFrameCallback | null = null;
      let latestParams: Record<string, number> = {};
      const director = createLive2DRealtimeMotionDirector({
        engine,
        onFrame: (params) => {
          latestParams = params;
        },
        now: () => currentTime,
        requestFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
        cancelFrame: () => {},
      });
      director.startTurn({ promptText: "" });
      director.pushSemanticIntent(intent);
      for (currentTime = 16; currentTime <= 960; currentTime += 16) frameCallback?.(currentTime);
      director.stop();
      return latestParams;
    };

    const excited = run({ emotion: "happy", tone: "excited", intensity: 0.94 });
    const celebratory = run({ emotion: "happy", tone: "celebratory", intensity: 0.94 });

    expect(excited.ParamExpression_3 ?? 0).toBe(0);
    expect(excited.ParamHide_EyesL1 ?? 0).toBe(0);
    expect(celebratory.ParamExpression_3 ?? 0).toBeGreaterThan(0.6);
  });

  it("lets strong recent reply chunks switch local emotion before semantic analysis", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      smoothingMs: 40,
      performanceBeatMs: 360,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "the release looked successful" });
    const happy = director.pushAssistantDelta("太棒了，发布终于成功了，大家都能松口气。");
    currentTime = 520;
    frameCallback?.(currentTime);
    const heldSkeptical = director.pushAssistantDelta("不过这个结果明显不对劲，我不相信。");
    currentTime = 2200;
    const skeptical = director.pushAssistantDelta("不过这个结果明显不对劲，我不相信。");
    currentTime = 2280;
    frameCallback?.(currentTime);
    director.stop();

    expect(happy?.emotion).toBe("happy");
    expect(heldSkeptical?.emotion).toBe("happy");
    expect(skeptical?.localPresetId).toBe("angry_skeptical");
    expect(skeptical?.emotion).toBe("angry");
    expect(frames.at(-1)?.meta.emotion).toBe("angry");
  });

  it("keeps rapid local chunk changes in micro motion until a performance beat can switch", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      reactionHoldMs: 520,
      performanceBeatMs: 320,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    const happy = director.pushAssistantDelta("太好了，终于成功了！");
    currentTime = 80;
    const skeptical = director.pushAssistantDelta("不过数据明显不对劲，我不相信。");
    currentTime = 160;
    frameCallback?.(currentTime);
    const reassuring = director.pushAssistantDelta("先别慌，深呼吸，我们一起处理。");
    currentTime = 720;
    const tooSoon = director.pushAssistantDelta("数据还是明显不对劲，我不相信。");
    currentTime = 1160;
    const settled = director.pushAssistantDelta("数据还是明显不对劲，我不相信。");
    director.stop();

    expect(happy?.emotion).toBe("happy");
    expect(skeptical?.emotion).toBe("happy");
    expect(reassuring?.emotion).toBe("happy");
    expect(frames.some((frame) => frame.meta.layers.speech > 0.1)).toBe(true);
    expect(tooSoon?.emotion).toBe("happy");
    expect(settled?.emotion).toBe("angry");
    expect(settled?.presetId).toBe("angry_skeptical");
  });

  it("keeps strong local chunk switches behind a human-readable performance beat", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      now: () => currentTime,
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "" });
    const happy = director.pushAssistantDelta("太好了，终于成功了！");
    currentTime = 760;
    const earlySkeptical = director.pushAssistantDelta("不过这个结果明显不对劲，我不相信。");
    currentTime = 1140;
    const stillHeldSkeptical = director.pushAssistantDelta("这个结果还是明显不对劲，我不相信。");
    currentTime = 2200;
    const settledSkeptical = director.pushAssistantDelta("这个结果还是明显不对劲，我不相信。");
    director.stop();

    expect(happy?.emotion).toBe("happy");
    expect(earlySkeptical?.emotion).toBe("happy");
    expect(earlySkeptical?.localPresetId).toBe("angry_skeptical");
    expect(stillHeldSkeptical?.emotion).toBe("happy");
    expect(settledSkeptical?.emotion).toBe("angry");
    expect(settledSkeptical?.presetId).toBe("angry_skeptical");
  });

  it("lets semantic performance corrections switch again after the residence window", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      semanticReactionHoldMs: 620,
      performanceBeatMs: 360,
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "太棒了，这次发布成功了。" });
    currentTime = 800;
    const delighted = director.pushSemanticIntent({ emotion: "surprised", tone: "delighted", intensity: 0.86 });
    currentTime = 900;
    const rapidTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    currentTime = 1500;
    const settledTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    director.stop();

    expect(delighted.presetId).toBe("surprised_delighted");
    expect(rapidTeasing.semanticPresetId).toBe("teasing_amused");
    expect(rapidTeasing.presetId).toBe("surprised_delighted");
    expect(settledTeasing.presetId).toBe("teasing_amused");
  });

  it("paces default semantic stream performance switches instead of following every chunk", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "这次发布成功了，大家都很开心。" });
    const firstBeat = director.pushSemanticIntent({ emotion: "happy", tone: "excited", intensity: 0.82 });
    currentTime = 1700;
    const earlyTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    currentTime = 3050;
    const repeatedTooSoon = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    currentTime = 3600;
    const settledTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    director.stop();

    expect(firstBeat.presetId).toBe("happy_excited");
    expect(earlyTeasing.semanticPresetId).toBe("teasing_amused");
    expect(earlyTeasing.presetId).toBe("happy_excited");
    expect(repeatedTooSoon.presetId).toBe("happy_excited");
    expect(settledTeasing.presetId).toBe("teasing_amused");
  });

  it("refines same-emotion semantic tone without restarting a full performance accent", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "这次发布已经顺利完成了吗？" });
    director.pushSemanticIntent({ emotion: "happy", tone: "excited", intensity: 0.9 });
    currentTime = 980;
    frameCallback?.(currentTime);
    director.finishAssistantText();
    director.pushSemanticIntent({ emotion: "happy", tone: "relieved", intensity: 0.76 });
    currentTime = 1140;
    frameCallback?.(currentTime);
    director.stop();

    expect(frames.at(-1)?.meta.tone).toBe("relieved");
    expect(frames.at(-1)?.meta.layers.accent ?? 0).toBe(0);
  });

  it("requires a stable semantic candidate before changing performance after the residence window", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      semanticReactionHoldMs: 900,
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "这次发布成功了，大家都很开心。" });
    const firstBeat = director.pushSemanticIntent({ emotion: "happy", tone: "excited", intensity: 0.82 });
    currentTime = 950;
    const oneOffPanic = director.pushSemanticIntent({ emotion: "panic", tone: "nervous", intensity: 0.86 });
    currentTime = 1300;
    const oneOffSad = director.pushSemanticIntent({ emotion: "sad", tone: "concerned", intensity: 0.82 });
    currentTime = 1700;
    const firstTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    currentTime = 2050;
    const repeatedTooSoon = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    currentTime = 3180;
    const repeatedTeasing = director.pushSemanticIntent({ emotion: "teasing", tone: "amused", intensity: 0.84 });
    director.stop();

    expect(firstBeat.presetId).toBe("happy_excited");
    expect(oneOffPanic.semanticPresetId).toBe("panic_nervous");
    expect(oneOffPanic.presetId).toBe("happy_excited");
    expect(oneOffSad.semanticPresetId).toBe("sad_concerned");
    expect(oneOffSad.presetId).toBe("happy_excited");
    expect(firstTeasing.semanticPresetId).toBe("teasing_amused");
    expect(firstTeasing.presetId).toBe("happy_excited");
    expect(repeatedTooSoon.presetId).toBe("happy_excited");
    expect(repeatedTeasing.presetId).toBe("teasing_amused");
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

  it("holds rapid streamed semantic intent changes while assistant chunks are still arriving", async () => {
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
    await vi.waitFor(() => expect(director.lastMeta?.semanticPresetId).toBe("teasing_amused"));
    director.stop();

    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(frames.some((frame) =>
      frame.meta.source === "semantic"
      && frame.meta.tone === "excited"
      && frame.meta.presetId === "happy_excited",
    )).toBe(true);
    expect(director.lastMeta?.source).toBe("semantic");
    expect(director.lastMeta?.emotion).toBe("happy");
    expect(director.lastMeta?.presetId).toBe("happy_excited");
    expect(director.lastMeta?.semanticPresetId).toBe("teasing_amused");
  });

  it("lets streamed semantic analyzer select explicit preset catalog entries", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const analyzer = {
      analyze: vi.fn(async (): Promise<EmotionIntent> => ({ emotion: "neutral", intensity: 0.2 })),
      async *stream(): AsyncGenerator<{ type: "intent"; intent: EmotionIntent }> {
        yield {
          type: "intent",
          intent: { emotion: "happy", presetId: "happy_giddy_bounce", intensity: 0.9 },
        };
      },
    };
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: analyzer,
      onFrame: () => {},
      semanticIntervalMs: 150,
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "今天的结果怎么样？" });
    director.pushAssistantDelta("结果已经出来了。");
    await vi.waitFor(() => expect(director.lastMeta?.presetId).toBe("happy_giddy_bounce"));
    director.stop();

    expect(director.lastMeta?.source).toBe("semantic");
    expect(director.lastMeta?.tone).toBe("excited");
    expect(director.lastMeta?.facialStyle).toBe("radiant");
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
    expect(analyzer.analyze).toHaveBeenCalledWith("User: 请根据回复做表情。\nAssistant: 刚才确实很开心\n[Assistant stream complete]");
    expect(director.lastMeta?.emotion).toBe("sad");
  });

  it("supersedes unfinished partial semantic streams with the final assistant reply", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let releasePartial: (() => void) | null = null;
    let partialStarted = false;
    const stream = vi.fn(async function* (text: string): AsyncGenerator<{ type: "intent"; intent: EmotionIntent }> {
      if (!text.includes("终于稳定了")) {
        partialStarted = true;
        await new Promise<void>((resolve) => {
          releasePartial = resolve;
        });
        yield { type: "intent", intent: { emotion: "shy", tone: "bashful", intensity: 0.76 } };
        return;
      }
      yield { type: "intent", intent: { emotion: "happy", tone: "relieved", intensity: 0.82 } };
      yield { type: "intent", intent: { emotion: "shy", tone: "bashful", intensity: 0.76 } };
    });
    const director = createLive2DRealtimeMotionDirector({
      engine,
      semanticAnalyzer: {
        analyze: vi.fn(async (): Promise<EmotionIntent> => ({ emotion: "neutral", intensity: 0.2 })),
        stream,
      },
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "结果出来了吗？" });
    director.pushAssistantDelta("太好了");
    await vi.waitFor(() => expect(partialStarted).toBe(true));
    director.pushAssistantDelta("，终于稳定了。");
    director.finishAssistantText();
    await vi.waitFor(() => expect(director.lastMeta?.tone).toBe("relieved"));
    releasePartial?.();
    await flushMicrotasks();
    director.stop();

    expect(stream).toHaveBeenCalledTimes(2);
    expect(director.lastMeta?.emotion).toBe("happy");
    expect(director.lastMeta?.tone).toBe("relieved");
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
    const semantic = director.pushSemanticIntent({ emotion: "panic", tone: "startled", intensity: 1 });
    for (let i = 0; i < 16; i += 1) {
      currentTime += 80;
      frameCallback?.(currentTime);
    }
    director.stop();

    expect(semantic.emotion).toBe("panic");
    expect(semantic.tone).toBe("reassuring");
    expect(frames.at(-1)?.params.ParamMouthOpenY ?? 0).toBeLessThan(0.95);
  });

  it("keeps self-blame comfort from becoming an overly happy final semantic pose", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => 0,
    });

    director.startTurn({ promptText: "embarrassed apology i messed up sorry" });
    const local = director.lastMeta;
    director.pushAssistantDelta("别这么说呀，谁都有不小心的时候嘛，别太自责啦。");
    director.finishAssistantText();
    const semantic = director.pushSemanticIntent({ emotion: "happy", tone: "reassuring", intensity: 0.86 });
    director.stop();

    expect(local?.presetId).toBe("embarrassed_apologetic");
    expect(semantic.emotion).toBe("embarrassed");
    expect(semantic.tone).toBe("apologetic");
    expect(semantic.presetId).toBe("embarrassed_apologetic");
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
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "i just won 800 yuan surprise unexpected happy" });
    const surprise = director.pushSemanticIntent({ emotion: "surprised", intensity: 0.8 });
    currentTime = 700;
    const heldHappy = director.pushSemanticIntent({ emotion: "happy", intensity: 0.8, specialExpression: "closed_eye_smile" });
    currentTime = 3800;
    const happy = director.pushSemanticIntent({ emotion: "happy", intensity: 0.8, specialExpression: "closed_eye_smile" });
    director.startTurn({ promptText: "you are reliable and this compliment makes me shy" });
    const shy = director.lastMeta;
    director.stop();

    expect(surprise.emotion).toBe("surprised");
    expect(heldHappy.emotion).toBe("surprised");
    expect(happy.emotion).toBe("happy");
    expect(shy?.emotion).toBe("shy");
    expect(shy?.source).toBe("local");
  });

  it("lets playful semantic calibration override compatible shy local reactions", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "my boss praised me and this compliment makes me shy" });
    const local = director.lastMeta;
    currentTime = 920;
    const teasing = director.pushSemanticIntent({ emotion: "teasing", intensity: 0.82 });
    director.stop();

    expect(local?.emotion).toBe("shy");
    expect(teasing.semanticEmotion).toBe("teasing");
    expect(teasing.emotion).toBe("teasing");
  });

  it("lets the first streamed semantic event correct a non-critical local guess", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "太棒了，这次发布成功了。" });
    const local = director.lastMeta;
    currentTime = 920;
    const corrected = director.pushSemanticIntent({ emotion: "surprised", tone: "delighted", intensity: 0.86 });
    director.stop();

    expect(local?.emotion).toBe("happy");
    expect(corrected.semanticEmotion).toBe("surprised");
    expect(corrected.emotion).toBe("surprised");
    expect(corrected.tone).toBe("delighted");
  });

  it("holds first broad semantic correction for a short human entry beat", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    let currentTime = 0;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: () => {},
      requestFrame: () => 1,
      cancelFrame: () => {},
      now: () => currentTime,
    });

    director.startTurn({ promptText: "太棒了，这次发布成功了。" });
    currentTime = 240;
    const tooFast = director.pushSemanticIntent({ emotion: "surprised", tone: "delighted", intensity: 0.86 });
    currentTime = 620;
    const settled = director.pushSemanticIntent({ emotion: "surprised", tone: "delighted", intensity: 0.86 });
    director.stop();

    expect(tooFast.semanticEmotion).toBe("surprised");
    expect(tooFast.emotion).toBe("happy");
    expect(settled.emotion).toBe("surprised");
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

  it("switches expression layers behind a blink mask instead of a token snap", async () => {
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
    currentTime = 180;
    frameCallback?.(currentTime);
    const beforeSwitch = frames.at(-1)?.params ?? {};
    currentTime = 360;
    frameCallback?.(currentTime);
    const midSwitch = frames.at(-1)?.params ?? {};
    currentTime = 920;
    frameCallback?.(currentTime);
    const afterSwitch = frames.at(-1)?.params ?? {};
    director.stop();

    expect(beforeSwitch.ParamExpression_3 ?? 0).toBeLessThan(0.15);
    expect(midSwitch.ParamExpression_3 ?? 0).toBeGreaterThan(0.25);
    expect(midSwitch.ParamExpression_3 ?? 0).toBeLessThan(0.9);
    expect(Math.min(midSwitch.ParamEyeLOpen ?? 1, midSwitch.ParamEyeROpen ?? 1)).toBeLessThan(0.55);
    expect(afterSwitch.ParamExpression_3 ?? 0).toBeGreaterThan(0.85);
    expect(Math.min(afterSwitch.ParamEyeLOpen ?? 1, afterSwitch.ParamEyeROpen ?? 1)).toBeGreaterThan(0.7);
  });

  it("keeps strong local celebration exp3 active after the realtime transition", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      smoothingMs: 40,
      expressiveness: 2.05,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "celebrate we won" });
    for (const time of [200, 400, 600, 900, 1200]) {
      currentTime = time;
      frameCallback?.(currentTime);
    }
    director.stop();

    expect(frames.at(-1)?.meta.presetId).toBe("happy_beaming");
    expect(frames.at(-1)?.meta.tone).toBe("celebratory");
    expect(frames.at(-1)?.params.ParamExpression_3 ?? 0).toBeGreaterThan(0.9);
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
    expect(Math.max(...frames.map((frame) => frame.meta.layers.facialBeat))).toBeGreaterThan(0.3);
    expect(Math.max(...frames.map((frame) => frame.meta.layers.accent))).toBeGreaterThan(0.2);
    expect(speechFrames.length).toBeGreaterThan(1);
    expect(Math.max(...mouthOpen) - Math.min(...mouthOpen)).toBeGreaterThan(0.04);
  });

  it("damps the director base sway for frozen performances", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const run = (intent: EmotionIntent) => {
      const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
      let currentTime = 0;
      let frameCallback: Live2DFrameCallback | null = null;
      const director = createLive2DRealtimeMotionDirector({
        engine,
        onFrame: (params, meta) => frames.push({ params, meta }),
        transitionMs: 240,
        smoothingMs: 24,
        stability: 0.68,
        expressiveness: 3.2,
        now: () => currentTime,
        requestFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
        cancelFrame: () => {},
      });
      director.startTurn({ promptText: "" });
      director.pushSemanticIntent(intent);
      for (const time of [420, 820, 1220, 1620]) {
        currentTime = time;
        frameCallback?.(currentTime);
      }
      director.stop();
      return frames;
    };
    const span = (frames: Array<{ params: Record<string, number> }>, id: string) => {
      const values = frames.map((frame) => frame.params[id] ?? 0);
      return Math.max(...values) - Math.min(...values);
    };

    const frozen = run({ emotion: "panic", tone: "startled", presetId: "panic_blank_stare", motionStyle: "still", intensity: 0.92 });
    const trembling = run({ emotion: "panic", tone: "nervous", presetId: "panic_small_shake", motionStyle: "tremble", intensity: 0.92 });
    const frozenPerformance = frozen.filter((frame) => frame.meta.motionStyle === "still");
    const tremblingPerformance = trembling.filter((frame) => frame.meta.motionStyle === "tremble");

    expect(Math.max(...frozenPerformance.map((frame) => frame.meta.layers.pose))).toBeLessThan(0.2);
    expect(span(tremblingPerformance, "ParamBodyAngleZ")).toBeGreaterThan(span(frozenPerformance, "ParamBodyAngleZ") + 0.6);
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
      ParamBodyAngleX: 0,
      ParamBodyAngleZ: 0,
      ParamAngleZ: 0,
      ParamBreath: 0.5,
      ParamBreathPhysics_L: 0,
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
      hasFeature: (feature) => ["gaze", "head", "body", "breath"].includes(feature),
    });

    expect(empty.speech).toBe(0);
    expect(empty.facialBeat).toBe(0);
    expect(empty.performance).toBe(0);
    expect(result.layers.face).toBeGreaterThan(0.7);
    expect(result.layers.facialBeat).toBeGreaterThan(0.5);
    expect(result.layers.speech).toBeGreaterThan(0.5);
    expect(result.layers.accent).toBeGreaterThan(0.4);
    expect(result.layers.pose).toBeGreaterThan(0.6);
    expect(result.layers.breath).toBeGreaterThan(0.4);
    expect(result.layers.performance).toBeGreaterThan(0.6);
    expect(result.params.ParamMouthOpenY).toBeGreaterThan(base.ParamMouthOpenY + 0.2);
    expect(result.params.ParamBodyAngleY).toBeGreaterThan(base.ParamBodyAngleY);
    expect(result.params.ParamBreath).not.toBe(base.ParamBreath);
  });

  it("resolves reusable motion performance styles from presets and explicit intents", () => {
    expect(resolveMotionPerformanceStyle({ emotion: "happy", presetId: "happy_giddy_bounce" })).toBe("bounce");
    expect(resolveMotionPerformanceStyle({ emotion: "shy", presetId: "shy_peek" })).toBe("peek");
    expect(resolveMotionPerformanceStyle({ emotion: "panic", presetId: "panic_bracing" })).toBe("brace");
    expect(resolveMotionPerformanceStyle({ emotion: "panic", presetId: "panic_frozen" })).toBe("still");
    expect(resolveMotionPerformanceStyle({ emotion: "panic", presetId: "panic_blank_stare" })).toBe("still");
    expect(resolveMotionPerformanceStyle({ emotion: "surprised", tone: "concerned" })).toBe("lean_in");
    expect(resolveMotionPerformanceStyle({ emotion: "crying", presetId: "crying_sob" })).toBe("sob");
    expect(resolveMotionPerformanceStyle({ emotion: "sleepy", presetId: "sleepy_head_nod" })).toBe("nod");
    expect(resolveMotionPerformanceStyle({ emotion: "happy", motionStyle: "still" })).toBe("still");
  });

  it("materializes motion styles for every built-in preset and local signal", () => {
    for (const preset of getDefaultEmotionSignalPresets()) {
      const intent = materializeEmotionSignalPreset({
        emotion: preset.emotion,
        presetId: preset.presetId,
      });
      expect(intent.motionStyle, preset.presetId).toBeTruthy();
    }

    expect(materializeEmotionSignalPreset({
      emotion: "happy",
      presetId: "happy_giddy_bounce",
    }).motionStyle).toBe("bounce");
    expect(estimateEmotionSignal("giddy bounce").intent.motionStyle).toBe("bounce");
    expect(estimateEmotionSignal("突然有点担心").intent.motionStyle).toBe("lean_in");
  });

  it("makes exported motion performance styles produce distinct safe body language", () => {
    const base = {
      ParamBodyAngleX: 0,
      ParamBodyAngleY: 0,
      ParamBodyAngleZ: 0,
      ParamAngleX: 0,
      ParamAngleY: 0,
      ParamAngleZ: 0,
      ParamEyeBallX: 0,
      ParamEyeBallY: 0,
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamEyeLSquint: 0,
      ParamEyeRSquint: 0,
      ParamMouthOpenY: 0,
      ParamJawOpen: 0,
      ParamMouthX: 0,
      ParamMouthShrug: 0,
      ParamCryDown_L: 0,
      ParamTearDisappear_1: 0,
      ParamPupilQuake_L1: 0,
      ParamPupilQuake_R1: 0,
      ParamBreath: 0.5,
      ParamBreathPhysics_L: 0,
    };
    const supported = new Set(Object.keys(base));
    const run = (motionStyle: NonNullable<EmotionIntent["motionStyle"]>, emotion: EmotionIntent["emotion"] = "happy") =>
      applyRealtimeMotionLayers(base, {
        intent: { emotion, motionStyle, intensity: 0.92 },
        phase: "reacting",
        source: "local",
        elapsedMs: 360,
        transitionElapsedMs: 260,
        speechEnergy: 0,
        lastAssistantDeltaAgeMs: Infinity,
        expressiveness: 2.4,
        stability: 0.55,
        hasParam: (id) => supported.has(id),
        hasFeature: (feature) => ["gaze", "head", "body", "breath"].includes(feature),
      });

    const bounce = run("bounce");
    const peek = run("peek", "shy");
    const flinch = run("flinch", "surprised");
    const still = run("still", "panic");
    const tremble = run("tremble", "panic");
    const sideEye = run("side_eye", "teasing");
    const sob = run("sob", "crying");
    const nod = run("nod", "sleepy");
    const yawn = run("yawn", "sleepy");

    expect(bounce.layers.performance).toBeGreaterThan(0.8);
    expect(bounce.params.ParamBodyAngleY ?? 0).toBeGreaterThan(peek.params.ParamBodyAngleY ?? 0);
    expect(flinch.params.ParamBodyAngleX ?? 0).toBeLessThan(bounce.params.ParamBodyAngleX ?? 0);
    expect(tremble.params.ParamPupilQuake_L1 ?? 0).toBeGreaterThan(still.params.ParamPupilQuake_L1 ?? 0);
    expect(still.layers.performance).toBe(0);
    expect(sideEye.params.ParamEyeBallX ?? 0).toBeLessThan(-0.1);
    expect(sob.params.ParamCryDown_L ?? 0).toBeGreaterThan(0.2);
    expect(nod.params.ParamAngleY ?? 0).toBeLessThan(-0.3);
    expect(yawn.params.ParamJawOpen ?? 0).toBeGreaterThan(nod.params.ParamJawOpen ?? 0);
  });

  it("makes exported realtime pose layers visibly different by tone", () => {
    const base = {
      ParamBodyAngleX: 0,
      ParamBodyAngleY: 0,
      ParamBodyAngleZ: 0,
      ParamAngleX: 0,
      ParamAngleY: 0,
      ParamAngleZ: 0,
      ParamBreath: 0.5,
      ParamBreathPhysics_L: 0,
      ParamMouthOpenY: 0.05,
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamBrowLY: 0,
      ParamBrowRY: 0,
    };
    const supported = new Set(Object.keys(base));
    const run = (intent: EmotionIntent) => applyRealtimeMotionLayers(base, {
      intent,
      phase: "reacting",
      source: "local",
      elapsedMs: 420,
      transitionElapsedMs: 260,
      speechEnergy: 0,
      lastAssistantDeltaAgeMs: Infinity,
      expressiveness: 1.9,
      stability: 0.45,
      hasParam: (id) => supported.has(id),
      hasFeature: (feature) => ["head", "body", "breath"].includes(feature),
    }).params;

    const delighted = run({ emotion: "happy", tone: "delighted", intensity: 0.9 });
    const guarded = run({ emotion: "angry", tone: "guarded", intensity: 0.9 });
    const apologetic = run({ emotion: "embarrassed", tone: "apologetic", intensity: 0.84 });

    expect(delighted.ParamBodyAngleY ?? 0).toBeGreaterThan(guarded.ParamBodyAngleY ?? 0);
    expect(guarded.ParamAngleZ ?? 0).toBeLessThan(apologetic.ParamAngleZ ?? 0);
    expect(apologetic.ParamAngleY ?? 0).toBeLessThan(delighted.ParamAngleY ?? 0);
    expect(Math.abs(delighted.ParamBreathPhysics_L ?? 0)).toBeGreaterThan(0.05);
  });

  it("animates safe tear flow parameters during realtime crying", () => {
    const base = {
      ParamTearDown_1: 0.55,
      ParamTearDown_2: 0.36,
      ParamTearDown_3: 0.2,
      ParamTearDisappear_1: 0,
      ParamTearDisappear_2: 0,
      ParamTearDisappear_3: 0,
    };
    const supported = new Set(Object.keys(base));
    const result = applyRealtimeMotionLayers(base, {
      intent: { emotion: "crying", tone: "wistful", intensity: 0.88, durationMs: 900 },
      phase: "reacting",
      source: "semantic",
      elapsedMs: 500,
      transitionElapsedMs: 220,
      speechEnergy: 0,
      lastAssistantDeltaAgeMs: Infinity,
      expressiveness: 1.8,
      stability: 0.45,
      hasParam: (id) => supported.has(id),
      hasFeature: () => false,
    });

    expect(result.params.ParamTearDown_2).toBeGreaterThan(base.ParamTearDown_2);
    expect(result.params.ParamTearDown_3).toBeGreaterThan(base.ParamTearDown_3);
    expect(result.params.ParamTearDisappear_1).toBeGreaterThan(0.1);
    expect(result.params.ParamTearDisappear_2).toBeGreaterThan(0.05);
  });

  it("uses optional safe model controls for richer realtime emotional texture", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const capability = engine.getMotionCapability();
    const safe = new Set(capability.safeParameterIds);
    const run = (
      emotion: EmotionIntent["emotion"],
      tone: NonNullable<EmotionIntent["tone"]>,
    ) => {
      const intent: EmotionIntent = { emotion, tone, intensity: 0.92 };
      const base = engine.generateFromIntent(intent).params;
      const params = applyRealtimeMotionLayers(base, {
        intent,
        phase: "reacting",
        source: "local",
        elapsedMs: 320,
        transitionElapsedMs: 240,
        speechEnergy: 0.86,
        lastAssistantDeltaAgeMs: 60,
        expressiveness: 2.15,
        stability: 0.55,
        hasParam: (id) => safe.has(id),
        hasFeature: (feature) => capability.availableFeatures.includes(feature),
      }).params;
      return { base, params };
    };

    const happy = run("happy", "celebratory");
    const shy = run("embarrassed", "flustered");
    const playful = run("teasing", "amused");
    const skeptical = run("confused", "skeptical");
    const panic = run("panic", "startled");
    const crying = run("crying", "wistful");

    expect(happy.params.ParamEyeOpenBlinkOF_L2 ?? 0).toBeGreaterThan(happy.base.ParamEyeOpenBlinkOF_L2 ?? 0);
    expect(shy.params.ParamCheekPuff ?? 0).toBeGreaterThan(shy.base.ParamCheekPuff ?? 0);
    expect(shy.params.ParamMouthPuckerWiden ?? 0).toBeLessThan(shy.base.ParamMouthPuckerWiden ?? 0);
    expect(playful.params.ParamTongueOut ?? 0).toBeGreaterThan(playful.base.ParamTongueOut ?? 0);
    expect(playful.params.ParamMouthAngleModify_XL ?? 0).toBeLessThan(playful.base.ParamMouthAngleModify_XL ?? 0);
    expect(skeptical.params.ParamEyeRSquint ?? 0).toBeGreaterThan(skeptical.base.ParamEyeRSquint ?? 0);
    expect(skeptical.params.ParamMouthAngleModify_YU ?? 0).toBeGreaterThan(skeptical.base.ParamMouthAngleModify_YU ?? 0);
    expect(panic.params.ParamEyeOpenBlinkOF_L2 ?? 0).toBeGreaterThan(panic.base.ParamEyeOpenBlinkOF_L2 ?? 0);
    expect(panic.params.ParamMouthAngleModify_YD ?? 0).toBeGreaterThan(panic.base.ParamMouthAngleModify_YD ?? 0);
    expect(crying.params.ParamCryDown_L ?? 0).toBeGreaterThan(crying.base.ParamCryDown_L ?? 0);
  });

  it("paces capability-safe facial beats instead of only holding static face targets", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const capability = engine.getMotionCapability();
    const safe = new Set(capability.safeParameterIds);
    const run = (intent: EmotionIntent, elapsedMs: number) => {
      const base = engine.generateFromIntent(intent).params;
      return applyRealtimeMotionLayers(base, {
        intent,
        phase: "reacting",
        source: "semantic",
        elapsedMs,
        transitionElapsedMs: 1800,
        speechEnergy: 0,
        lastAssistantDeltaAgeMs: Infinity,
        expressiveness: 3.2,
        stability: 0.68,
        hasParam: (id) => safe.has(id),
        hasFeature: (feature) => capability.availableFeatures.includes(feature),
      });
    };

    const happyBloom = run({ emotion: "happy", tone: "celebratory", intensity: 0.92 }, 420);
    const happyRest = run({ emotion: "happy", tone: "celebratory", intensity: 0.92 }, 2220);
    const shyGlance = run({ emotion: "embarrassed", tone: "flustered", intensity: 0.92 }, 520);
    const shyRest = run({ emotion: "embarrassed", tone: "flustered", intensity: 0.92 }, 2760);
    const cryingRelease = run({ emotion: "crying", tone: "wistful", intensity: 0.92 }, 2020);
    const cryingBuild = run({ emotion: "crying", tone: "wistful", intensity: 0.92 }, 900);
    const frozen = run({ emotion: "panic", presetId: "panic_blank_stare", motionStyle: "still", intensity: 0.92 }, 420);

    expect(happyBloom.params.ParamEyeOpenBlink_L2 ?? 0).toBeGreaterThan(happyRest.params.ParamEyeOpenBlink_L2 ?? 0);
    expect(shyGlance.params.ParamEyeBallX ?? 0).toBeLessThan(shyRest.params.ParamEyeBallX ?? 0);
    expect(cryingRelease.params.ParamTearDisappear_1 ?? 0).toBeGreaterThan(cryingBuild.params.ParamTearDisappear_1 ?? 0);
    expect(frozen.layers.facialBeat).toBe(0);
  });

  it("keeps realtime layer strength tunable above expressiveness 2.6", () => {
    const base = {
      ParamBodyAngleY: 0,
      ParamAngleY: 0,
      ParamCheek: 0,
      ParamEyeSmile_Happy_L: 0,
      ParamEyeSmile_Happy_R: 0,
      ParamMouthOpenY: 0,
    };
    const supported = new Set(Object.keys(base));
    const run = (expressiveness: number) => applyRealtimeMotionLayers(base, {
      intent: { emotion: "happy", tone: "excited", intensity: 0.4 },
      phase: "reacting",
      source: "local",
      elapsedMs: 320,
      transitionElapsedMs: 240,
      speechEnergy: 0,
      lastAssistantDeltaAgeMs: Infinity,
      expressiveness,
      stability: 0.55,
      hasParam: (id) => supported.has(id),
      hasFeature: (feature) => ["head", "body"].includes(feature),
    });

    const medium = run(2.6);
    const vivid = run(3.2);

    expect(vivid.layers.face).toBeGreaterThan(medium.layers.face);
    expect(vivid.layers.pose).toBeGreaterThan(medium.layers.pose);
    expect(vivid.params.ParamBodyAngleY ?? 0).toBeGreaterThan(medium.params.ParamBodyAngleY ?? 0);
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
    const determinedIncident = resolveEmotionSignalPreset({ emotion: "panic", tone: "determined" });
    const apologeticEmbarrassment = resolveEmotionSignalPreset({ emotion: "embarrassed", tone: "apologetic" });

    expect(presets.length).toBeGreaterThanOrEqual(132);
    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(presetIds).toContain("happy_excited");
    expect(presetIds).toContain("panic_reassuring");
    expect(presetIds).toContain("panic_startled");
    expect(presetIds).toContain("happy_relieved");
    expect(presetIds).toContain("happy_beaming");
    expect(presetIds).toContain("panic_bracing");
    expect(presetIds).toContain("embarrassed_tear_drop");
    expect(presetIds).toContain("sad_wistful");
    expect(presetIds).toContain("angry_guarded");
    expect(presetIds).toContain("sleepy_relieved");
    expect(presetIds).toContain("confused_skeptical");
    expect(presetIds).toContain("happy_delighted");
    expect(presetIds).toContain("panic_determined");
    expect(presetIds).toContain("embarrassed_apologetic");
    expect(presetIds).toContain("confused_amused");
    expect(presetIds).toContain("angry_skeptical");
    expect(presetIds).toContain("sleepy_grateful");
    expect(presetIds).toContain("happy_soft_pride");
    expect(presetIds).toContain("happy_warm_relief");
    expect(presetIds).toContain("happy_gentle_gratitude");
    expect(presetIds).toContain("panic_alarm");
    expect(presetIds).toContain("panic_recovery");
    expect(presetIds).toContain("surprised_positive_news");
    expect(presetIds).toContain("shy_flustered_praise");
    expect(presetIds).toContain("teasing_smug");
    expect(presetIds).toContain("teasing_mischief");
    expect(presetIds).toContain("confused_metric_skeptical");
    expect(presetIds).toContain("confused_careful_review");
    expect(presetIds).toContain("angry_exasperated_retry");
    expect(presetIds).toContain("angry_cold_guarded");
    expect(presetIds).toContain("sad_gentle_reassurance");
    expect(presetIds).toContain("sad_heavy_concern");
    expect(presetIds).toContain("sleepy_cozy");
    expect(presetIds).toContain("happy_touched");
    expect(presetIds).toContain("panic_frozen");
    expect(presetIds).toContain("surprised_speechless");
    expect(presetIds).toContain("teasing_wry");
    expect(presetIds).toContain("sad_hurt");
    expect(presetIds).toContain("sleepy_yawn");
    expect(presetIds).toContain("happy_sparkle_delight");
    expect(presetIds).toContain("happy_relief_laugh");
    expect(presetIds).toContain("happy_proud_tease");
    expect(presetIds).toContain("panic_hyperventilate");
    expect(presetIds).toContain("panic_blank_stare");
    expect(presetIds).toContain("panic_forced_calm");
    expect(presetIds).toContain("surprised_sparkle");
    expect(presetIds).toContain("confused_deadpan");
    expect(presetIds).toContain("shy_cover_face");
    expect(presetIds).toContain("shy_happy_squirm");
    expect(presetIds).toContain("teasing_side_eye");
    expect(presetIds).toContain("teasing_tongue_out");
    expect(presetIds).toContain("confused_side_eye");
    expect(presetIds).toContain("confused_blank_processing");
    expect(presetIds).toContain("angry_flash");
    expect(presetIds).toContain("angry_silent_glare");
    expect(presetIds).toContain("sad_quivering_smile");
    expect(presetIds).toContain("sad_tears_welling");
    expect(presetIds).toContain("crying_sob");
    expect(presetIds).toContain("sleepy_head_nod");
    expect(presetIds).toContain("happy_giddy_bounce");
    expect(presetIds).toContain("happy_soft_laugh");
    expect(presetIds).toContain("happy_blushing_praise");
    expect(presetIds).toContain("panic_world_spinning");
    expect(presetIds).toContain("panic_choked_words");
    expect(presetIds).toContain("panic_urgent_focus");
    expect(presetIds).toContain("surprised_double_take");
    expect(presetIds).toContain("surprised_tiny_gasp");
    expect(presetIds).toContain("confused_loading");
    expect(presetIds).toContain("confused_suspicious_squint");
    expect(presetIds).toContain("sad_small_voice");
    expect(presetIds).toContain("sad_lonely");
    expect(presetIds).toContain("crying_silent_tears");
    expect(presetIds).toContain("angry_eye_twitch");
    expect(presetIds).toContain("angry_forced_smile");
    expect(presetIds).toContain("embarrassed_steam");
    expect(presetIds).toContain("shy_peek");
    expect(presetIds).toContain("teasing_smug_side");
    expect(presetIds).toContain("teasing_fake_innocent");
    expect(presetIds).toContain("sleepy_mumbling");
    expect(presetIds).toContain("sleepy_big_yawn");
    expect(presetIds).toContain("sad_warm_comfort");
    expect(presetIds).toContain("happy_nervous_laugh");
    expect(presetIds).toContain("panic_small_shake");
    expect(presetIds).toContain("surprised_concerned_turn");
    expect(presetIds).toContain("surprised_relief_release");
    expect(presetIds).toContain("embarrassed_nervous_laugh");
    expect(presetIds).toContain("embarrassed_grateful_blush");
    expect(presetIds).toContain("shy_apologetic_glance");
    expect(presetIds).toContain("teasing_reassuring_smile");
    expect(presetIds).toContain("crying_touched_release");
    expect(presetIds).toContain("confused_cautious_rethink");
    expect(excited?.presetId).toBe("happy_excited");
    expect(reassuring?.presetId).toBe("sad_reassuring");
    expect(determinedIncident?.presetId).toBe("panic_determined");
    expect(apologeticEmbarrassment?.presetId).toBe("embarrassed_apologetic");
  });

  it("keeps positive surprise and flustered embarrassment visually distinct from nearby presets", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const startledPreset = resolveEmotionSignalPreset({ emotion: "surprised", tone: "startled" });
    const delightedPreset = resolveEmotionSignalPreset({ emotion: "surprised", tone: "delighted" });
    const bashfulPreset = resolveEmotionSignalPreset({ emotion: "shy", tone: "bashful" });
    const flusteredPreset = resolveEmotionSignalPreset({ emotion: "embarrassed", tone: "flustered" });

    expect(startledPreset?.presetId).toBe("surprised_startled");
    expect(delightedPreset?.presetId).toBe("surprised_delighted");
    expect(bashfulPreset?.presetId).toBe("shy_bashful");
    expect(flusteredPreset?.presetId).toBe("embarrassed_tear_drop");

    const startled = engine.generateFromIntent({ ...startledPreset!, intensity: 0.9 });
    const delighted = engine.generateFromIntent({ ...delightedPreset!, intensity: 0.9 });
    const bashful = engine.generateFromIntent({ ...bashfulPreset!, intensity: 0.9 });
    const flustered = engine.generateFromIntent({ ...flusteredPreset!, intensity: 0.9 });

    expect(delighted.params.ParamMouthForm ?? 0).toBeGreaterThan(startled.params.ParamMouthForm ?? 0);
    expect(delighted.params.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(0.35);
    expect(startled.params.ParamPupilQuake_L1 ?? 0).toBeGreaterThan(delighted.params.ParamPupilQuake_L1 ?? 0);
    expect(Math.abs(flustered.params.ParamMouthX ?? 0)).toBeGreaterThan(Math.abs(bashful.params.ParamMouthX ?? 0) + 0.08);
    expect(flustered.params.ParamMouthShrug ?? 0).toBeGreaterThan(bashful.params.ParamMouthShrug ?? 0);
    expect(flustered.params.ParamExpression_2 ?? 0).toBe(1);
  });

  it("matches expanded immediate presets for expressive dialogue fragments", () => {
    expect(estimateEmotionSignal("哈哈哈哈，庆祝一下，我们大获全胜！").presetId).toBe("happy_beaming");
    expect(estimateEmotionSignal("太社死了，我尴尬死了，真想找个地缝。").presetId).toBe("embarrassed_tear_drop");
    expect(estimateEmotionSignal("我不敢看了，吓得闭眼。").presetId).toBe("panic_bracing");
    expect(estimateEmotionSignal("还是有一点舍不得，想起来很怀念。").presetId).toBe("sad_wistful");
    expect(estimateEmotionSignal("这件事要警惕，别急着相信。").presetId).toBe("angry_guarded");
    expect(estimateEmotionSignal("终于能休息了，先睡一会儿。").presetId).toBe("sleepy_relieved");
    expect(estimateEmotionSignal("我来处理，马上止血，现在就修。").presetId).toBe("panic_determined");
    expect(estimateEmotionSignal("别逗我，你又逗我，坏心眼。").presetId).toBe("shy_playful");
    expect(estimateEmotionSignal("不好意思我搞砸了，尴尬抱歉。").presetId).toBe("embarrassed_apologetic");
    expect(estimateEmotionSignal("这也太离谱，被整笑了。").presetId).toBe("confused_amused");
    expect(estimateEmotionSignal("突然可疑，先别信这个突然。").presetId).toBe("surprised_guarded");
    expect(estimateEmotionSignal("明显不对劲，我不相信。").presetId).toBe("angry_skeptical");
    expect(estimateEmotionSignal("谢谢你让我休息，安心睡了。").presetId).toBe("sleepy_grateful");
  });

  it("matches nuanced immediate presets for common dialogue transitions", () => {
    expect(estimateEmotionSignal("稳稳拿下，一次就过。").presetId).toBe("happy_soft_pride");
    expect(estimateEmotionSignal("总算结束，可以放心了。").presetId).toBe("happy_warm_relief");
    expect(estimateEmotionSignal("真的谢谢你一直陪着。").presetId).toBe("happy_gentle_gratitude");
    expect(estimateEmotionSignal("告警炸了，全线报警。").presetId).toBe("panic_alarm");
    expect(estimateEmotionSignal("恢复中别慌，先喘口气再看。").presetId).toBe("panic_recovery");
    expect(estimateEmotionSignal("真的？太好了，居然成了。").presetId).toBe("surprised_positive_news");
    expect(estimateEmotionSignal("别再夸了，夸得我脸都红了。").presetId).toBe("shy_flustered_praise");
    expect(estimateEmotionSignal("看吧我猜对了，我就知道。").presetId).toBe("teasing_smug");
    expect(estimateEmotionSignal("被我骗到了吧，开个小玩笑。").presetId).toBe("teasing_mischief");
    expect(estimateEmotionSignal("数据对不上，指标异常。").presetId).toBe("confused_metric_skeptical");
    expect(estimateEmotionSignal("让我再确认，逐项核对。").presetId).toBe("confused_careful_review");
    expect(estimateEmotionSignal("怎么又出问题，又卡住了。").presetId).toBe("angry_exasperated_retry");
    expect(estimateEmotionSignal("保持警惕，不要轻信。").presetId).toBe("angry_cold_guarded");
    expect(estimateEmotionSignal("没关系我在，不要一个人扛。").presetId).toBe("sad_gentle_reassurance");
    expect(estimateEmotionSignal("越想越担心，心里不踏实。").presetId).toBe("sad_heavy_concern");
    expect(estimateEmotionSignal("困困的但很安心，睡吧。").presetId).toBe("sleepy_cozy");
  });

  it("matches additional facial performance presets for expressive dialogue beats", () => {
    expect(estimateEmotionSignal("你这样陪着我，真的有点被感动到了。").presetId).toBe("happy_touched");
    expect(estimateEmotionSignal("我脑子一片空白，整个人都吓傻了。").presetId).toBe("panic_frozen");
    expect(estimateEmotionSignal("我真的愣住了，一时间说不出话。").presetId).toBe("surprised_speechless");
    expect(estimateEmotionSignal("哼，被我逮到了吧，nice try。").presetId).toBe("teasing_wry");
    expect(estimateEmotionSignal("对，就这样慢慢放松下来。别怕，我陪着你呢。").presetId).toBe("sad_reassuring");
    expect(estimateEmotionSignal("这句话让我有点受伤，心里真的很难受。").presetId).toBe("sad_hurt");
    expect(estimateEmotionSignal("困得一直打哈欠，我先睡啦。").presetId).toBe("sleepy_yawn");
  });

  it("matches high-intensity expressive presets for visible Live2D acting", () => {
    expect(estimateEmotionSignal("眼睛都亮了，开心到发光，太惊喜了！").presetId).toBe("happy_sparkle_delight");
    expect(estimateEmotionSignal("差点哭出来，但终于松了一大口气。").presetId).toBe("happy_relief_laugh");
    expect(estimateEmotionSignal("怎么样，我厉害吧，这次稳稳拿下。").presetId).toBe("happy_proud_tease");
    expect(estimateEmotionSignal("我喘不过气了，呼吸都乱了。").presetId).toBe("panic_hyperventilate");
    expect(estimateEmotionSignal("整个人呆住了，大脑直接宕机。").presetId).toBe("panic_blank_stare");
    expect(estimateEmotionSignal("我还在发抖，但会慢慢来。").presetId).toBe("panic_forced_calm");
    expect(estimateEmotionSignal("哇，眼睛都亮了，完全没想到！").presetId).toBe("surprised_sparkle");
    expect(estimateEmotionSignal("啊这，我沉默了。").presetId).toBe("confused_deadpan");
    expect(estimateEmotionSignal("想捂脸，脸热到想躲起来。").presetId).toBe("shy_cover_face");
    expect(estimateEmotionSignal("开心得不好意思，整个人都扭起来了。").presetId).toBe("shy_happy_squirm");
    expect(estimateEmotionSignal("我斜眼看你，少来这一套。").presetId).toBe("teasing_side_eye");
    expect(estimateEmotionSignal("略略略，逗你玩的。").presetId).toBe("teasing_tongue_out");
    expect(estimateEmotionSignal("我眯眼看着这个结果，总觉得不对。").presetId).toBe("confused_side_eye");
    expect(estimateEmotionSignal("脑袋转不过来，需要加载一下。").presetId).toBe("confused_blank_processing");
    expect(estimateEmotionSignal("火一下就上来了，真的忍不了。").presetId).toBe("angry_flash");
    expect(estimateEmotionSignal("我冷着脸不说话，先看他怎么解释。").presetId).toBe("angry_silent_glare");
    expect(estimateEmotionSignal("我只能勉强笑一下，其实很难过。").presetId).toBe("sad_quivering_smile");
    expect(estimateEmotionSignal("眼眶都红了，眼泪在打转。").presetId).toBe("sad_tears_welling");
    expect(estimateEmotionSignal("我开始抽噎，哭得停不下来。").presetId).toBe("crying_sob");
    expect(estimateEmotionSignal("困得一直点头，快睡着了。").presetId).toBe("sleepy_head_nod");
  });

  it("matches broader conversation acting presets beyond the MVP catalog", () => {
    expect(estimateEmotionSignal("开心到坐不住，整个人想蹦起来。").presetId).toBe("happy_giddy_bounce");
    expect(estimateEmotionSignal("忍不住轻轻笑了一下，真的好可爱。").presetId).toBe("happy_soft_laugh");
    expect(estimateEmotionSignal("被你夸得又开心又脸红。").presetId).toBe("happy_blushing_praise");
    expect(estimateEmotionSignal("感觉整个世界都在转，心跳好快。").presetId).toBe("panic_world_spinning");
    expect(estimateEmotionSignal("喉咙像卡住了，一句话都说不出来。").presetId).toBe("panic_choked_words");
    expect(estimateEmotionSignal("现在立刻处理，先止血，别扩散。").presetId).toBe("panic_urgent_focus");
    expect(estimateEmotionSignal("等等，我需要二次确认一下，真的假的？").presetId).toBe("surprised_double_take");
    expect(estimateEmotionSignal("我倒吸一口气，这也太突然了。").presetId).toBe("surprised_tiny_gasp");
    expect(estimateEmotionSignal("等一下，让我想想，我脑袋还在加载。").presetId).toBe("confused_loading");
    expect(estimateEmotionSignal("我眯起眼睛看这个结果，越看越可疑。").presetId).toBe("confused_suspicious_squint");
    expect(estimateEmotionSignal("声音都变小了，我有点说不下去。").presetId).toBe("sad_small_voice");
    expect(estimateEmotionSignal("突然觉得有点孤单，好像没人懂。").presetId).toBe("sad_lonely");
    expect(estimateEmotionSignal("我没有出声，但眼泪一直往下掉。").presetId).toBe("crying_silent_tears");
    expect(estimateEmotionSignal("气得眼皮跳，真的快忍不住了。").presetId).toBe("angry_eye_twitch");
    expect(estimateEmotionSignal("我都气笑了，这也太离谱。").presetId).toBe("angry_forced_smile");
    expect(estimateEmotionSignal("脸烫得冒烟，别看我了。").presetId).toBe("embarrassed_steam");
    expect(estimateEmotionSignal("我偷偷看你一眼，又不敢直视。").presetId).toBe("shy_peek");
    expect(estimateEmotionSignal("哼哼，我得意地斜眼看你。").presetId).toBe("teasing_smug_side");
    expect(estimateEmotionSignal("我可什么都不知道哦，装无辜一下。").presetId).toBe("teasing_fake_innocent");
    expect(estimateEmotionSignal("困到说话都含糊了，先让我眯一下。").presetId).toBe("sleepy_mumbling");
    expect(estimateEmotionSignal("大大打了个哈欠，眼睛都睁不开。").presetId).toBe("sleepy_big_yawn");
    expect(estimateEmotionSignal("没事的，我在这里陪你，慢慢说。").presetId).toBe("sad_warm_comfort");
    expect(estimateEmotionSignal("哈哈有点紧张，只能先笑一下。").presetId).toBe("happy_nervous_laugh");
    expect(estimateEmotionSignal("我手小幅度发抖，但还能继续。").presetId).toBe("panic_small_shake");
    expect(estimateEmotionSignal("等等，这不太对，我突然有点担心。").presetId).toBe("surprised_concerned_turn");
    expect(estimateEmotionSignal("没想到这么快就稳住了，居然已经恢复了。").presetId).toBe("surprised_relief_release");
    expect(estimateEmotionSignal("我只能尴尬地笑一下，笑得有点尴尬。").presetId).toBe("embarrassed_nervous_laugh");
    expect(estimateEmotionSignal("被照顾得有点不好意思，谢谢你还愿意陪着我。").presetId).toBe("embarrassed_grateful_blush");
    expect(estimateEmotionSignal("抱歉让你等了这么久，有点不好意思麻烦你。").presetId).toBe("shy_apologetic_glance");
    expect(estimateEmotionSignal("好啦不逗你了，开玩笑的别紧张。").presetId).toBe("teasing_reassuring_smile");
    expect(estimateEmotionSignal("好啦，不逗你了。我刚才只是开玩笑的，别紧张，我不会再吓你了。").presetId).toBe("teasing_reassuring_smile");
    expect(estimateEmotionSignal("感动得眼泪掉下来了，我只能哭着说谢谢。").presetId).toBe("crying_touched_release");
    expect(estimateEmotionSignal("先别下结论，让我重新想想，这里可能还有问题。").presetId).toBe("confused_cautious_rethink");
  });

  it("maps symbolic facial styles into visibly distinct safe parameter combinations", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const generate = (intent: EmotionIntent) => engine.generateFromIntent({
      intensity: 0.88,
      ...intent,
    }).params;
    const gentle = generate({ emotion: "happy", tone: "tender", facialStyle: "gentle" });
    const touched = generate({ emotion: "happy", tone: "grateful", facialStyle: "grateful" });
    const shaken = generate({ emotion: "panic", tone: "startled", facialStyle: "shaken" });
    const frozen = generate({ emotion: "panic", tone: "startled", facialStyle: "frozen" });
    const skeptical = generate({ emotion: "confused", tone: "skeptical", facialStyle: "skeptical" });
    const hurt = generate({ emotion: "sad", tone: "disappointed", facialStyle: "hurt" });

    expect(maxParamDistance(gentle, touched)).toBeGreaterThan(0.2);
    expect(maxParamDistance(shaken, frozen)).toBeGreaterThan(0.2);
    expect(touched.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(gentle.ParamEyeSmile_Happy_L ?? 0);
    expect(frozen.ParamEyeCircles ?? 0).toBeGreaterThan(shaken.ParamEyeCircles ?? 0);
    expect(skeptical.ParamEyeRSquint ?? 0).toBeGreaterThan(0.2);
    expect(hurt.ParamMouthShrug ?? 0).toBeGreaterThan(0.35);
    expect(hurt.ParamTearDown_1 ?? 0).toBeGreaterThan(0.2);
  });

  it("keeps high-intensity expressive presets visibly separated in generated parameter space", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const generate = (text: string) => engine.generateFromIntent({
      ...estimateEmotionSignal(text).intent,
      intensity: 0.92,
    }).params;

    const sparkle = generate("眼睛都亮了，开心到发光，太惊喜了！");
    const reliefLaugh = generate("差点哭出来，但终于松了一大口气。");
    const hyper = generate("我喘不过气了，呼吸都乱了。");
    const forcedCalm = generate("我还在发抖，但会慢慢来。");
    const coverFace = generate("想捂脸，脸热到想躲起来。");
    const sideEye = generate("我斜眼看你，少来这一套。");
    const coldGlare = generate("我冷着脸不说话，先看他怎么解释。");
    const tearsWelling = generate("眼眶都红了，眼泪在打转。");
    const sob = generate("我开始抽噎，哭得停不下来。");
    const headNod = generate("困得一直点头，快睡着了。");

    expect(maxParamDistance(sparkle, reliefLaugh)).toBeGreaterThan(0.45);
    expect(maxParamDistance(hyper, forcedCalm)).toBeGreaterThan(0.8);
    expect(coverFace.ParamCheek ?? 0).toBeGreaterThan(0.9);
    expect(sideEye.ParamMouthX ?? 0).toBeLessThan(-0.35);
    expect(coldGlare.ParamMouthPressLipOpen ?? 0).toBeLessThan(-0.45);
    expect(tearsWelling.ParamTearDown_1 ?? 0).toBeGreaterThan(0.35);
    expect(sob.ParamCryDown_L ?? 0).toBeGreaterThan(tearsWelling.ParamCryDown_L ?? 0);
    expect(headNod.ParamEyeLOpen ?? 1).toBeLessThan(0.42);
  });

  it("keeps every explicit preset facial contour distinct after materialization", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const faceParameterIds = engine.getParameterManifest().safeParameterIds.filter((id) =>
      /Eye|Brow|Mouth|Jaw|Tongue|Cheek|Tear|Cry|fire/.test(id)
      && !id.startsWith("ParamExpression_")
      && !id.includes("Hide_"),
    );
    const groups = new Map<string, string[]>();

    for (const preset of getDefaultEmotionSignalPresets()) {
      const params = engine.generateFromIntent({
        emotion: preset.emotion,
        presetId: preset.presetId,
        intensity: 0.9,
      }).params;
      const key = JSON.stringify(faceParameterIds.map((id) => Number((params[id] ?? 0).toFixed(4))));
      groups.set(key, [...(groups.get(key) ?? []), preset.presetId ?? preset.presetLabel ?? preset.emotion]);
    }

    expect([...groups.values()].filter((presetIds) => presetIds.length > 1)).toEqual([]);
  });

  it("keeps low-intensity semantic corrections facially readable in realtime frames", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const run = (intent: EmotionIntent) => {
      let currentTime = 0;
      let frameCallback: Live2DFrameCallback | null = null;
      let latest: { params: Record<string, number>; meta: RealtimeMotionFrameMeta } | null = null;
      const director = createLive2DRealtimeMotionDirector({
        engine,
        onFrame: (params, meta) => {
          latest = { params, meta };
        },
        requestFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
        cancelFrame: () => {},
        now: () => currentTime,
      });
      director.startTurn({ promptText: "" });
      director.pushSemanticIntent(intent);
      for (const time of [180, 360, 620, 920, 1280, 1640, 2100]) {
        currentTime = time;
        frameCallback?.(currentTime);
      }
      director.stop();
      return latest;
    };

    const relieved = run({ emotion: "happy", tone: "relieved", intensity: 0.28 });
    const concerned = run({ emotion: "sad", tone: "concerned", intensity: 0.28 });
    const skeptical = run({ emotion: "confused", tone: "skeptical", intensity: 0.28 });
    const guarded = run({ emotion: "angry", tone: "guarded", intensity: 0.28 });

    expect(relieved?.params.ParamEyeSmile_Happy_L ?? 0).toBeGreaterThan(0.55);
    expect(relieved?.params.ParamMouthForm ?? 0).toBeGreaterThan(0.8);
    expect(concerned?.params.ParamBrowLY ?? 0).toBeGreaterThan(0.56);
    expect(concerned?.params.ParamTearDown_1 ?? 0).toBeGreaterThan(0.28);
    expect(skeptical?.params.ParamMouthX ?? 0).toBeLessThan(-0.36);
    expect(skeptical?.params.ParamEyeLSquint ?? 0).toBeGreaterThan(0.42);
    expect(guarded?.params.ParamBrowLY ?? 0).toBeLessThan(-0.62);
    expect(guarded?.params.ParamMouthPressLipOpen ?? 0).toBeLessThan(-0.58);
  });

  it("keeps nuanced dialogue presets distinct in generated parameter space", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const generate = (text: string) => engine.generateFromIntent({
      ...estimateEmotionSignal(text).intent,
      intensity: 0.86,
    }).params;
    const pride = generate("稳稳拿下，一次就过。");
    const relief = generate("总算结束，可以放心了。");
    const alarm = generate("告警炸了，全线报警。");
    const recovery = generate("恢复中别慌，先喘口气再看。");
    const smug = generate("看吧我猜对了，我就知道。");
    const mischief = generate("被我骗到了吧，开个小玩笑。");
    const skeptical = generate("数据对不上，指标异常。");
    const carefulReview = generate("让我再确认，逐项核对。");
    const reassurance = generate("没关系我在，不要一个人扛。");
    const concern = generate("越想越担心，心里不踏实。");

    expect(maxParamDistance(pride, relief)).toBeGreaterThan(0.35);
    expect(maxParamDistance(alarm, recovery)).toBeGreaterThan(1.2);
    expect(mischief.ParamTongueOut ?? 0).toBeGreaterThan((smug.ParamTongueOut ?? 0) + 0.35);
    expect(maxParamDistance(skeptical, carefulReview)).toBeGreaterThan(1);
    expect(maxParamDistance(reassurance, concern)).toBeGreaterThan(1);
  });

  it("treats recovery encouragement as relief instead of disappointed sadness", () => {
    const recovery = estimateEmotionSignal({
      promptText: "recovery in progress stabilized for now take a breath and slow down",
      replyText: "呼……太好了，终于稳下来了。你也辛苦了，先喝口水缓一缓吧。这种时候最需要让心跳慢下来呢。",
      timestampMs: 0,
    });
    const disappointment = estimateEmotionSignal("这段时间真的很辛苦，结果还是失败了。");

    expect(recovery.source).toBe("reply");
    expect(recovery.presetId).toBe("happy_warm_relief");
    expect(disappointment.presetId).toBe("sad_disappointed");
  });

  it("lets a startled recovery reply settle into a calmer incident preset", () => {
    const recovery = estimateEmotionSignal({
      promptText: "recovery in progress stabilized for now take a breath and slow down",
      replyText: "呼……谢谢你。刚才真的吓死我了，感觉整个世界都在转，现在总算能看清东西了。我会慢慢来，不急了。",
      timestampMs: 0,
    });

    expect(recovery.source).toBe("reply");
    expect(recovery.presetId).toBe("panic_recovery");
    expect(recovery.intent.tone).toBe("reassuring");
  });

  it("classifies English incident alarm and recovery prompts locally", () => {
    const startled = estimateEmotionSignal("The production incident scared me badly and my heart is still racing.");
    const recovery = estimateEmotionSignal(
      "The production incident scared me badly. It is stable now, but my heart is still racing. Please help me slow down and take a breath.",
    );

    expect(startled.presetId).toBe("panic_startled");
    expect(recovery.presetId).toBe("panic_recovery");
    expect(recovery.intent.tone).toBe("reassuring");
  });

  it("prioritizes recent assistant reply fragments for chunk-level local motion", () => {
    const calming = estimateEmotionSignal({
      promptText: "production is down every user is reporting errors urgent panic",
      replyText: "天哪，这下麻烦大了，心跳都快提到嗓子眼了。先记录现场和日志，确认错误范围，再看告警。没关系，谁都有不小心的时候，别太自责。",
      timestampMs: 0,
    });
    const suspicious = estimateEmotionSignal({
      promptText: "we won and everything looks stable",
      replyText: "太棒了，发布终于成功了，大家都能松口气。先庆祝一下，不过这个结果后半段明显不对劲，我不相信。",
      timestampMs: 0,
    });

    expect(calming.source).toBe("reply");
    expect(calming.presetId).toBe("sad_reassuring");
    expect(suspicious.source).toBe("reply");
    expect(suspicious.presetId).toBe("angry_skeptical");
  });

  it("prioritizes concern over success keywords in mixed metric conversations", () => {
    const prompt = estimateEmotionSignal("上线结果很成功，但指标里有一处很奇怪，我现在有点不安，也不敢完全相信这个结果。");
    const reply = estimateEmotionSignal({
      promptText: "上线结果很成功，但指标里有一处很奇怪，我现在有点不安。",
      replyText: "上线成功是好事呀，但指标有疑问确实会让人不安心。要不要先仔细看看那个奇怪的地方？",
      timestampMs: 0,
    });
    const english = estimateEmotionSignal("release looked successful, but one metric is suspicious and strange. i feel uneasy and do not fully trust the result.");
    const assistantWording = estimateEmotionSignal({
      promptText: "release success but metric suspicious strange uneasy not trust",
      replyText: "嗯，听起来有点不对劲。虽然成功了，但总觉得哪里怪怪的，让人不太放心。",
      timestampMs: 0,
    });

    expect(prompt.presetId).toBe("confused_skeptical");
    expect(reply.source).toBe("reply");
    expect(reply.presetId).toBe("confused_skeptical");
    expect(english.presetId).toBe("confused_skeptical");
    expect(assistantWording.presetId).toBe("confused_skeptical");
    expect(reply.intent.emotion).not.toBe("happy");
  });

  it("keeps concerned realtime settling frames visually readable", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const frames: Array<{ params: Record<string, number>; meta: RealtimeMotionFrameMeta }> = [];
    let currentTime = 0;
    let frameCallback: Live2DFrameCallback | null = null;
    const director = createLive2DRealtimeMotionDirector({
      engine,
      onFrame: (params, meta) => frames.push({ params, meta }),
      smoothingMs: 36,
      stability: 0.5,
      expressiveness: 2.2,
      now: () => currentTime,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });

    director.startTurn({ promptText: "上线结果很成功，但指标里有一处很奇怪，我现在有点不安。" });
    director.pushAssistantDelta("上线成功是好事呀，但指标有疑问确实会让人不安心。");
    director.finishAssistantText();
    director.pushSemanticIntent({ emotion: "confused", tone: "concerned", intensity: 0.52 });
    for (const time of [160, 320, 520, 760]) {
      currentTime = time;
      frameCallback?.(currentTime);
    }
    director.stop();

    const latest = frames.at(-1);
    expect(latest?.meta.emotion).toBe("confused");
    expect(latest?.meta.tone).toBe("concerned");
    expect(latest?.meta.layers.face ?? 0).toBeGreaterThan(0.65);
    expect(latest?.params.ParamBrowLY ?? 0).toBeGreaterThan(0.42);
    expect(latest?.params.ParamEyeLOpen ?? 1).toBeLessThan(0.92);
    expect(latest?.params.ParamMouthStraight ?? 0).toBeGreaterThan(0.22);
    expect(latest?.params.ParamEyeCircles ?? 0).toBeGreaterThan(0.12);
  });

  it("activates exp3 layers for strong local celebration and bracing presets", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const beamingSignal = estimateEmotionSignal("哈哈哈哈，庆祝一下，我们大获全胜！");
    const bracingSignal = estimateEmotionSignal("我不敢看了，吓得闭眼。");
    const beaming = engine.generateFromIntent(beamingSignal.intent);
    const bracing = engine.generateFromIntent(bracingSignal.intent);

    expect(beamingSignal.presetId).toBe("happy_beaming");
    expect(beaming.params.ParamExpression_3 ?? 0).toBe(1);
    expect(bracingSignal.presetId).toBe("panic_bracing");
    expect(bracing.params.ParamExpression_4 ?? 0).toBe(1);
    expect(bracing.params.ParamHide_EyesL1 ?? 0).toBe(1);
  });

  it("keeps expanded tone presets visually separated in generated poses", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const delighted = engine.generateFromIntent({ ...estimateEmotionSignal("中奖了，太惊喜了！").intent, intensity: 0.9 });
    const determined = engine.generateFromIntent({ ...estimateEmotionSignal("我来处理，马上止血，现在就修。").intent, intensity: 0.9 });
    const apology = engine.generateFromIntent({ ...estimateEmotionSignal("不好意思我搞砸了，尴尬抱歉。").intent, intensity: 0.9 });
    const suspicious = engine.generateFromIntent({ ...estimateEmotionSignal("明显不对劲，我不相信。").intent, intensity: 0.9 });

    expect(delighted.params.ParamMouthForm ?? 0).toBeGreaterThan(0.7);
    expect(delighted.params.ParamEyeOpenBlink_L1 ?? 0).toBeGreaterThan(0.18);
    expect(determined.params.ParamMouthPressLipOpen ?? 0).toBeLessThan(-0.35);
    expect(determined.params.ParamEyeSmile_Angry_L ?? 0).toBeGreaterThan(0.2);
    expect(apology.params.ParamAngleY ?? 0).toBeLessThan(-2.8);
    expect(apology.params.ParamCheek ?? 0).toBeGreaterThan(0.35);
    expect(suspicious.params.ParamMouthX ?? 0).toBeLessThan(-0.12);
    expect(suspicious.params.fire ?? 0).toBeGreaterThan(0);
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

function maxParamDistance(a: Record<string, number>, b: Record<string, number>): number {
  return Math.max(...Array.from(
    new Set([...Object.keys(a), ...Object.keys(b)]),
    (id) => Math.abs((a[id] ?? 0) - (b[id] ?? 0)),
  ));
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
