# Live2D LLM Expression

Rule-first MVP for converting structured emotion intents into safe Live2D parameter output from scanned Live2D model resources.

Implemented scope:

- scan Live2D resource files
- parse VTube Studio parameter ranges and hotkeys
- parse CDI metadata, physics dependencies, and expression presets
- build a character profile
- build a parameter manifest that groups discovered parameters by role and safety
- map emotion intents to whitelisted Live2D parameters
- clamp outputs to safe ranges
- expose a small engine API
- analyze text with either a deterministic mock analyzer or an OpenAI-compatible chat completions endpoint
- generate simple or natural expression timelines with duration-scaled intermediate keyframes

Out of scope for this MVP:

- VTube Studio WebSocket control
- moc3 parsing
- advanced timeline easing and animation curves

## Example

```python
from live2d_llm_expression import Live2DExpressionEngine

engine = Live2DExpressionEngine.from_directory("yachiyo")
result = engine.generate_by_emotion("shy", intensity=0.7)
print(result.model_dump_json(indent=2))
```

For offline smoke tests, `generate_from_text(...)` uses a deterministic mock analyzer:

```python
result = engine.generate_from_text("八千代有点害羞地笑了一下")
```

To use an OpenAI-compatible chat completions endpoint, create a `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:

```text
LIVE2D_LLM_BASE_URL=https://api.openai.com/v1
LIVE2D_LLM_MODEL=your-model
LIVE2D_LLM_API_KEY=your-key
```

Then:

```python
from live2d_llm_expression import Live2DExpressionEngine

engine = Live2DExpressionEngine.from_directory_with_env_analyzer("yachiyo")
result = engine.generate_from_text("八千代有点害羞地笑了一下")
```

## HTTP Server

Start the local API with the deterministic mock analyzer:

```bash
live2d-expression-server --model yachiyo --port 8765
```

Use the environment-configured LLM analyzer:

```bash
live2d-expression-server --model yachiyo --port 8765 --use-env-analyzer
```

Endpoints:

- `GET /health`
- `GET /profile`
- `POST /emotion`
- `POST /text`
- `POST /timeline`

Example:

```bash
curl -X POST http://127.0.0.1:8765/emotion \
  -H 'Content-Type: application/json' \
  -d '{"emotion":"shy","intensity":0.7}'
```

Timeline example:

```bash
curl -X POST http://127.0.0.1:8765/timeline \
  -H 'Content-Type: application/json' \
  -d '{"text":"八千代有点害羞地笑了一下"}'
```

## TypeScript Package

Web projects can install this repository as an npm package and use the engine directly. In a browser you must pass explicit resource URLs because browser code cannot list arbitrary folders:

```ts
import {
  Live2DExpressionEngine,
  applyParamsToLive2DModel,
  playTimelineOnLive2DModel,
  sampleTimeline,
} from "@kuguya-ai/nature-live2d";

const engine = await Live2DExpressionEngine.fromUrls({
  rootUrl: "/models/yachiyo/",
  model3Path: "八千代辉夜姬.model3.json",
  cdi3Path: "八千代辉夜姬.cdi3.json",
  physics3Path: "八千代辉夜姬.physics3.json",
  vtubePath: "八千代辉夜姬.vtube.json",
  exp3Paths: ["眼泪.exp3.json", "泪珠.exp3.json", "笑咪咪.exp3.json", "眯眯眼.exp3.json"],
});

const result = engine.generateByEmotion("shy", { intensity: 0.7 });
applyParamsToLive2DModel(cubismModel, result.params, { runtime: "auto" });

const layered = engine.generateFromIntent({
  emotion: "panic",
  tone: "reassuring",
  intensity: 0.75,
});
applyParamsToLive2DModel(cubismModel, layered.params, { runtime: "auto" });

const manifest = engine.getParameterManifest();
console.log(manifest.safeParameterIds);

const timeline = await engine.generateTimelineFromText("八千代有点害羞地笑了一下");
applyParamsToLive2DModel(cubismModel, sampleTimeline(timeline, 300), {
  runtime: "pixi-live2d-display",
  weight: 0.9,
});
```

Use the natural timeline API when the host app has an assistant reply and needs a full motion segment instead of a single target expression. The configured analyzer converts the text to structured JSON intent first, then `durationMs` and `frameIntervalMs` determine how many intermediate parameter frames are generated:

```ts
const motion = await engine.generateNaturalTimelineFromText("诶，被这样夸奖有点不好意思，但我很开心。", {
  durationMs: 1800,
  frameIntervalMs: 120,
  liveliness: 0.65,
  stability: 0.82,
  expressiveness: 1.45,
});

playTimelineOnLive2DModel(pixiLive2DModel, motion, {
  runtime: "pixi-live2d-display",
  weight: 0.9,
});
```

Natural timelines include `neutral`, `thinking`, `anticipation`, `reaction`, and `settle` phases where possible. The built-in motion director keeps posture stable inside each phase, adds only low-frequency micro motion, and limits per-parameter speed so gaze and head motion do not flip every keyframe. `sampleTimeline(...)` interpolates between keyframes by default, so custom render loops can request parameters for any elapsed time inside the segment.

### Parameter manifest

Every model is normalized into a parameter manifest before the mapper drives motion. This keeps the package from assuming one fixed Yachiyo parameter set:

```ts
import {
  buildParameterManifest,
  inspectLive2DModelFromModel3Url,
  summarizeMotionCapability,
  summarizeParameterManifest,
} from "@kuguya-ai/nature-live2d";

const manifest = engine.getParameterManifest();
const capability = engine.getMotionCapability();

console.log(summarizeParameterManifest(manifest));
console.log(summarizeMotionCapability(capability));
console.log(manifest.byRole.mouth);
console.log(manifest.blockedParameterIds);
```

The manifest marks parameters as:

- `safe`: selected from the scanned model sources and used by the default mapper.
- `guarded`: known model parameters that are not driven by default.
- `blocked`: physics-driven or downstream-only parameters that should not be written directly.
- `unknown`: parameters that need an explicit host-app mapping before control.

Use this manifest when importing a new model directory to inspect available mouth, eye, brow, body, breath, and expression-layer controls before tuning richer motion. `getMotionCapability()` is the higher-level view used by the default mapper and realtime director: it reports which motion features are available and which core features are missing, so unsupported advanced controls are filtered or folded into supported basic controls instead of producing abrupt no-op parameters.

When a web app only knows the model folder and `.model3.json`, inspect it first. The helper reads `FileReferences` from the model3 file and auto-adds referenced `.physics3.json`, `.cdi3.json`, and `.exp3.json` resources:

```ts
const report = await inspectLive2DModelFromModel3Url({
  rootUrl: "/models/my-character/",
  model3Path: "my-character.model3.json",
  vtubePath: "my-character.vtube.json",
});

console.log(report.strategy);
console.log(report.capability.missingCoreFeatures);
console.log(report.recommendations);

if (report.defaultMotionUsable) {
  const engine = await Live2DExpressionEngine.fromModel3Url({
    rootUrl: "/models/my-character/",
    model3Path: "my-character.model3.json",
    vtubePath: "my-character.vtube.json",
  });
}
```

For Node/build-time imports, scan a directory and get the same report:

```ts
import { inspectLive2DModelDirectory } from "@kuguya-ai/nature-live2d/node";

const report = await inspectLive2DModelDirectory("models/my-character");
```

### Runtime adapters

The package core is runtime-agnostic: it produces safe parameter maps and timelines. Rendering stays in the host app. The adapter layer can write those parameters to common Live2D runtimes:

```ts
import { playTimelineOnLive2DModel } from "@kuguya-ai/nature-live2d";

playTimelineOnLive2DModel(pixiLive2DModel, timeline, {
  runtime: "pixi-live2d-display",
  weight: 0.9,
});

playTimelineOnLive2DModel(cubismModel, timeline, {
  runtime: "cubism-sdk",
  resolveParameterId: (id) => CubismFramework.getIdManager().getId(id),
});

playTimelineOnLive2DModel(customRuntimeModel, timeline, {
  runtime: "custom",
  setParameterValue: (id, value, weight) => {
    customRuntimeModel.setParam(id, value, weight);
  },
});
```

Use `runtime: "auto"` when your target exposes a familiar `setParameterValueById(...)` method. Prefer an explicit runtime in production integrations so failures point at the adapter boundary instead of being hidden inside detection.

For server-side LLM evaluation, use the OpenAI-compatible analyzer and keep API keys out of browser bundles:

```ts
import { OpenAICompatibleEmotionAnalyzer } from "@kuguya-ai/nature-live2d";

const analyzer = new OpenAICompatibleEmotionAnalyzer({
  baseUrl: process.env.LIVE2D_LLM_BASE_URL!,
  apiKey: process.env.LIVE2D_LLM_API_KEY!,
  model: process.env.LIVE2D_LLM_MODEL || "mimo-v2.5",
});

const intent = await analyzer.analyze("User: ...\nYachiyo: ...");
const timeline = engine.generateTimelineFromIntent(intent);
```

For streaming assistant responses, use the realtime motion director. It starts base body motion at turn start, reacts to assistant deltas with a low-latency local estimator, and can consume a streamed semantic emotion side channel in parallel:

```ts
import {
  createLive2DRealtimeMotionDirector,
  OpenAICompatibleEmotionAnalyzer,
} from "@kuguya-ai/nature-live2d";

const emotionAnalyzer = new OpenAICompatibleEmotionAnalyzer({
  baseUrl: process.env.LIVE2D_LLM_BASE_URL!,
  apiKey: process.env.LIVE2D_LLM_API_KEY!,
  model: process.env.LIVE2D_LLM_MODEL || "mimo-v2.5",
  provider: "auto",
  maxTokens: 260,
  temperature: 0.15,
});

const director = createLive2DRealtimeMotionDirector({
  engine,
  model: pixiLive2DModel,
  runtime: "pixi-live2d-display",
  semanticAnalyzer: emotionAnalyzer,
  smoothingMs: 220,
  transitionMs: 440,
  stability: 0.62,
  expressiveness: 2.05,
  weight: 0.9,
});

director.startTurn({ promptText: `User: ${latestUserMessage}` });

for await (const chunk of assistantTextStream) {
  director.pushAssistantDelta(chunk);
}

director.finishAssistantText();
```

`OpenAICompatibleEmotionAnalyzer.stream(...)` calls an OpenAI-compatible chat completions endpoint with `stream: true` and parses complete NDJSON emotion objects as they arrive. When the realtime director receives an analyzer with a `stream()` method, it automatically consumes streamed semantic intents for the current `prompt + partial assistant reply`; otherwise it falls back to `analyze(...)`. `provider: "auto"` leaves generic OpenAI-compatible models untouched and applies known low-latency request extensions for MiMo reasoning models. For other providers, pass `provider: "custom"` plus `extraBody` if that provider needs a model-specific flag. This keeps the LLM-side emotion correction closer to the assistant reply stream without asking the LLM to emit raw Live2D parameter IDs. For custom render loops, omit `model` and provide `onFrame(params, meta)` instead.

The realtime director now composes several runtime layers per frame: core target expression, facial micro expression, speech mouth motion, attention/gaze motion, body pose, breath, transition accent, and expression-mask blink. `meta.layers` reports the active weights for `face`, `speech`, `gaze`, `pose`, `breath`, `accent`, and `mask`, so a host app can debug why a frame is moving. Use `expressiveness` around `0.8` to `2.6` to tune how strongly the director boosts readable facial poses and short head/body accents; higher values make reactions more visible while still clamping to the inspected model capability. Set `layeredMotion: false` or `speechMotion: false` if the host app wants to replace those layers with its own render-loop behavior.

The intent model is layered: `emotion` is the broad class and optional `tone` refines it. For example, `emotion: "panic", tone: "nervous"` keeps a tense wide-eyed reaction, while `emotion: "panic", tone: "reassuring"` turns the same incident context into softer worried brows, a calmer mouth, and a steadier posture. Supported tones are `concerned`, `reassuring`, `relieved`, `proud`, `playful`, `bashful`, `determined`, `disappointed`, `nervous`, `excited`, `grateful`, `amused`, `skeptical`, `focused`, `apologetic`, `frustrated`, and `startled`.

The local first layer is also exposed as a reusable preset catalog. Host apps can inspect or replace the default presets, and realtime frame metadata reports which preset is currently driving motion:

```ts
import {
  estimateEmotionSignal,
  getDefaultEmotionSignalPresets,
  resolveEmotionSignalPreset,
} from "@kuguya-ai/nature-live2d";

console.log(getDefaultEmotionSignalPresets().map((preset) => preset.presetId));
console.log(estimateEmotionSignal("太棒了，终于发布成功了！").presetId);
console.log(resolveEmotionSignalPreset({ emotion: "happy", tone: "excited" })?.presetId);
```

The default mapper uses the model profile to clamp outputs to safe controllable parameters. For Yachiyo this includes head/body angles, eye open, eye smile, eye squint, eye ball, brow controls, mouth form/open/shape/thickness/jaw, cheek, cheek puff, tongue, mouth pucker/funnel/press/shrug, breath, and expression-layer toggles. For other models, the safe set is derived from VTube parameter mappings, expression presets, CDI metadata, physics inputs, and common Live2D control names. Physics downstream parameters and switch controls are discovered but not driven by default.

For Node or build-time validation, scan a local directory:

```ts
import { scanLive2DResources } from "@kuguya-ai/nature-live2d/node";

const engine = await Live2DExpressionEngine.fromNodeDirectory("yachiyo");
const resources = await scanLive2DResources("yachiyo");
```

## Web Demo

Run a local browser demo that renders the bundled Yachiyo model through `pixi-live2d-display` and drives it with this package. The demo calls OpenAI-compatible endpoints through local Vite middleware. The browser never receives the API key; `/api/chat-stream` proxies the assistant reply stream and `/api/emotion-stream` proxies streamed semantic emotion events:

```bash
export LIVE2D_LLM_BASE_URL=https://your-openai-compatible-host/v1
export LIVE2D_LLM_API_KEY=...
export LIVE2D_LLM_MODEL=mimo-v2.5
npm run demo:web
```

Open:

```text
http://127.0.0.1:5175/demo/
```

## Development

```bash
python3 -m pip install -e ".[dev]"
python3 -m pytest
npm install
npm run build
npm run test:ts
```
