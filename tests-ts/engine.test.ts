import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  Live2DExpressionEngine,
  applyParamsToLive2DModel,
  createResourceSetFromUrls,
  sampleTimeline,
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

  it("keeps neutral start for very short timelines", async () => {
    const engine = await Live2DExpressionEngine.fromNodeDirectory(YACHIYO_DIR);
    const timeline = engine.generateTimelineByEmotion("happy", { intensity: 0.5, durationMs: 1 });

    expect(timeline.keyframes.map((keyframe) => keyframe.t)).toEqual([0, 1]);
    expect(timeline.keyframes[0].params.ParamMouthForm).toBeCloseTo(0);
    expect(timeline.keyframes[1].params.ParamMouthForm).toBeGreaterThan(0);
  });

  it("exposes Node scanning as a separate helper", async () => {
    const resources = await scanLive2DResources(YACHIYO_DIR);

    expect(resources.source).toBe("file");
    expect(resources.vtube?.endsWith(".vtube.json")).toBe(true);
    expect(resources.exp3).toHaveLength(4);
    expect(resources.ignored.some((path) => path.endsWith("items_pinned_to_model.json"))).toBe(true);
  });
});
