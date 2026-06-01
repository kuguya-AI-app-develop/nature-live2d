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
  applyTarget: "all",
  weight: 1,
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

Use `runtime: "auto"` when your target exposes a familiar `setParameterValueById(...)` method. Prefer an explicit runtime in production integrations so failures point at the adapter boundary instead of being hidden inside detection. If a runtime's model wrapper or motion manager appears to soften or overwrite expression params, pass `applyTarget: "all"` to write every discovered visible setter, or `applyTarget: "core"` when the host has confirmed the core model is the only effective setter.

For `pixi-live2d-display`, realtime frames can also be applied as a render-phase overlay:

```ts
const applier = createLive2DParameterApplier(pixiLive2DModel, {
  runtime: "pixi-live2d-display",
  applyTarget: "all",
  applyTiming: "immediate",
});
```

When the host calls the director from the Pixi ticker after the model has updated, `applyTiming: "immediate"` writes the overlay before render and avoids waiting until the next model update. `applyTiming: "before-model-update"` is still available for integrations whose runtime event ordering has been verified. Call `applier.dispose()` when replacing the model or adapter.

For runtime diagnostics, keep the applier around and probe the actual write target:

```ts
import { createLive2DParameterApplier } from "@kuguya-ai/nature-live2d";

const applier = createLive2DParameterApplier(pixiLive2DModel, {
  runtime: "pixi-live2d-display",
  applyTarget: "core",
});

applier.apply({ ParamMouthForm: 0.7 });
console.log(applier.read("ParamMouthForm"));
console.table(applier.probe({ ParamMouthForm: 0.7, ParamEyeSmile_Happy_L: 0.4 }));
```

`probe(...)` applies the requested params, reads them back when the runtime exposes a getter, and reports `matched`, `mismatch`, or `unreadable`. This is useful when a host runtime wrapper accepts writes but the visible model still does not change.

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
  applyTarget: "all",
  applyTiming: "immediate",
  semanticAnalyzer: emotionAnalyzer,
  smoothingMs: 360,
  transitionMs: 820,
  reactionHoldMs: 1900,
  semanticReactionHoldMs: 3200,
  performanceBeatMs: 1360,
  stability: 0.68,
  expressiveness: 3.2,
  weight: 1,
});

director.startTurn({ promptText: `User: ${latestUserMessage}` });

for await (const chunk of assistantTextStream) {
  director.pushAssistantDelta(chunk);
}

director.finishAssistantText();
```

`OpenAICompatibleEmotionAnalyzer.stream(...)` calls an OpenAI-compatible chat completions endpoint with `stream: true` and parses complete NDJSON emotion objects as they arrive. When the realtime director receives an analyzer with a `stream()` method, it automatically consumes streamed semantic intents for the current `prompt + partial assistant reply`; otherwise it falls back to `analyze(...)`. The analyzer advertises the built-in `presetId` catalog to the LLM, strongly prefers whitelisted preset ids when a preset matches, and still forbids raw Live2D parameter ids. `provider: "auto"` leaves generic OpenAI-compatible models untouched and applies known low-latency request extensions for MiMo reasoning models. For other providers, pass `provider: "custom"` plus `extraBody` if that provider needs a model-specific flag. This keeps the LLM-side emotion correction closer to the assistant reply stream while letting the model select richer semantic presets. For custom render loops, omit `model` and provide `onFrame(params, meta)` instead.

The realtime director now composes several runtime layers per frame: core target expression, facial readability anchors, a short-lived onset contour for the first transition beat, facial micro expression, a slower segmented facial beat, speech mouth motion, attention/gaze motion, body pose, symbolic motion performance, breath, transition accent, and expression-mask blink. The onset contour makes eyes, brows, cheeks, and mouth readable while the slower smoothed target is still settling, then fades out. The facial beat adds capability-safe 2.5 to 4.3 second performance contours for smile blooms, shy glances, soft blinks, alarm spikes, skeptical asymmetry, lip tightening, and tear release without restarting on every streamed chunk. `meta.layers` reports the active weights for `face`, `facialBeat`, `speech`, `gaze`, `pose`, `performance`, `breath`, `accent`, and `mask`, so a host app can debug why a frame is moving. Use `expressiveness` around `0.8` to `3.2` to tune how strongly the director boosts readable facial poses and short head/body accents; the default is `3.2`, paired with higher stability and longer transition beats so host apps get visible motion without token-synchronous twitch. Higher values make reactions more visible while still clamping to the inspected model capability. Set `layeredMotion: false` or `speechMotion: false` if the host app wants to replace those layers with its own render-loop behavior.

Optional inspected controls are reused when a model exposes them: richer eyelid layers, cheek puff, asymmetric squint, lip pucker, tongue, mouth-corner modifiers, tear flow, and crying depth can add texture without hard-coding a required parameter vocabulary. Semantic intents with `tone`, `facialStyle`, or `presetId` receive an extra readability amplifier over broad emotion-only mapping, so LLM-selected presets are visibly different even when the raw emotion is the same. Expression masks preserve stronger tear, crying, and effect parameters from the mapped expression instead of flattening them to the `.exp3` baseline. The capability filter still blocks Cubism physics downstream parameters, which should continue reacting through the model physics chain instead of being written directly.

For custom render loops, `applyRealtimeMotionLayers(...)` is also exported and now includes body pose, symbolic motion performance, and breath layers in addition to face, speech, gaze, and accent motion. That lets host apps keep their own runtime adapter while still reusing the same expressive motion logic.

The intent model is layered: `emotion` is the broad class, optional `tone` refines the beat, optional `facialStyle` selects a reusable symbolic face texture, and optional `motionStyle` selects body-language timing. Motion styles include `bounce`, `laugh`, `soft_sway`, `peek`, `squirm`, `flinch`, `double_take`, `tremble`, `brace`, `lean_in`, `side_eye`, `withdraw`, `sob`, `nod`, `yawn`, `stern`, and `still`. For example, `emotion: "panic", tone: "nervous", facialStyle: "shaken", motionStyle: "tremble"` keeps a tense wide-eyed reaction with fast body and pupil motion, while `emotion: "panic", tone: "reassuring", facialStyle: "concerned", motionStyle: "soft_sway"` turns the same incident context into softer worried brows, a calmer mouth, and steadier posture. The package maps symbolic styles to inspected safe model controls; LLM output should not include raw parameter ids. Expression masks remain deliberate accents: ordinary high-intensity `happy + excited` keeps an open-eyed smile, while `closed_eye_smile` is selected by a celebration preset or an explicit intent.

The first meaningful reply fragment can react promptly, and the first streamed semantic event can correct a non-critical local guess after a short entry beat instead of snapping the face immediately. After that, macro performance changes use human-readable residence windows: local chunk changes default to `reactionHoldMs: 1900`, semantic changes default to `semanticReactionHoldMs: 3200`, and candidate adoption also obeys `performanceBeatMs: 1360`. Chunks continue driving speech, gaze, breath, and facial micro motion during the hold. A broad emotion or explicit expression-mask change starts a new onset/accent beat, while same-emotion tone, pose, and facial-style refinements glide toward the updated target without restarting the full transition. Strong sentence-boundary changes wait for the same residence window and a stable candidate beat instead of using a token-synchronous shortcut. Streamed semantic candidates must repeat or remain stable long enough before they can replace the active performance. The model follows the conversation in visible beats rather than flipping faces per chunk. High-priority local incident reactions such as `panic`, `sad`, or `angry` remain guarded against unrelated one-off semantic events, while compatible calibration such as `panic/nervous -> panic/reassuring` still settles promptly.

When `finishAssistantText()` runs, the director immediately supersedes any older partial-reply calibration request and consumes one final resting intent. Late results from the older request are ignored, so the model does not keep replaying stale semantic corrections after the visible reply has finished.

During assistant streaming, the local estimator gives extra priority to the latest reply fragment instead of scoring the full accumulated reply equally. This lets a long answer move from alarm to reassurance, or from celebration to suspicion, without waiting for the final semantic analyzer. Mixed messages such as "release succeeded, but the metrics look suspicious" are weighted toward concern/skepticism instead of being swallowed by early success keywords.

The local first layer and OpenAI-compatible analyzer both use the same reusable preset catalog. Host apps can inspect or replace the default presets, analyzer prompts can ask for whitelisted `presetId` values, and realtime frame metadata reports which preset is currently driving motion:

```ts
import {
  estimateEmotionSignal,
  getDefaultEmotionSignalPresets,
  materializeEmotionSignalPreset,
  resolveEmotionSignalPreset,
  resolveMotionPerformanceStyle,
} from "@kuguya-ai/nature-live2d";

console.log(getDefaultEmotionSignalPresets().map((preset) => preset.presetId));
console.log(estimateEmotionSignal("太棒了，终于发布成功了！").presetId);
console.log(resolveEmotionSignalPreset({ emotion: "happy", tone: "excited" })?.presetId);
console.log(materializeEmotionSignalPreset({
  emotion: "happy",
  presetId: "happy_giddy_bounce",
}));
console.log(resolveMotionPerformanceStyle({
  emotion: "happy",
  presetId: "happy_giddy_bounce",
}));
```

The built-in catalog currently includes 132 default presets, covering immediate reactions such as delighted surprise, determined incident takeover, playful shyness, apologetic embarrassment, metric skepticism, amused confusion, suspicious anger, tender comfort, and sleepy gratitude in addition to the broader happy/panic/sad/teasing families. Nuanced dialogue presets distinguish quiet pride, warm relief, gentle gratitude, alert spikes, incident recovery, flustered praise, smug or mischievous teasing, careful review, guarded frustration, heavy concern, cozy sleepiness, sparkling delight, hyperventilating panic, cover-face embarrassment, side-eye teasing, silent glare, sobbing tears, head-nodding sleepiness, nervous laughter, double-take surprise, concerned or relieved surprise, apologetic shyness, reassuring teasing, touched tears, cautious rethinking, silent tears, angry eye-twitching, fake innocence, and other common conversation beats. `materializeEmotionSignalPreset(...)` turns an explicit preset id into its declared tone, facial style, motion style, gaze, head, eye, brow, mouth, and optional expression defaults before mapping. `resolveMotionPerformanceStyle(...)` also infers a capability-safe movement motif from preset ids and semantic intent when a host does not pass `motionStyle` directly. Explicit caller fields still win.

The default mapper uses the model profile to clamp outputs to safe controllable parameters. For Yachiyo this includes head/body angles, eye open, eye smile, eye squint, eye ball, brow controls, mouth form/open/shape/thickness/jaw, cheek, cheek puff, tongue, mouth pucker/funnel/press/shrug, breath, and expression-layer toggles. For other models, the safe set is derived from VTube parameter mappings, expression presets, CDI metadata, physics inputs, and common Live2D control names. Physics downstream parameters and switch controls are discovered but not driven by default.

For Node or build-time validation, scan a local directory:

```ts
import { scanLive2DResources } from "@kuguya-ai/nature-live2d/node";

const engine = await Live2DExpressionEngine.fromNodeDirectory("yachiyo");
const resources = await scanLive2DResources("yachiyo");
```

## Web Demo

Run a local browser demo that renders the bundled Yachiyo model through `pixi-live2d-display` and drives it with this package. The demo calls OpenAI-compatible endpoints through local Vite middleware. The browser never receives the API key; `/api/chat-stream` proxies the assistant reply stream and `/api/emotion-stream` proxies streamed semantic emotion events. For a long-running local demo, copy `.env.example` to the ignored `.env.local` file and fill in the local values once:

```bash
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
