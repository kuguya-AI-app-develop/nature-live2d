# Live2D LLM Expression

Rule-first MVP for converting structured emotion intents into safe Live2D parameter output for the Yachiyo model resources in this repository.

Implemented scope:

- scan Live2D resource files
- parse VTube Studio parameter ranges and hotkeys
- parse CDI metadata, physics dependencies, and expression presets
- build a character profile
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
});

playTimelineOnLive2DModel(pixiLive2DModel, motion, {
  runtime: "pixi-live2d-display",
  weight: 0.9,
});
```

Natural timelines include `neutral`, `thinking`, `anticipation`, `reaction`, and `settle` phases where possible. The built-in motion director keeps posture stable inside each phase, adds only low-frequency micro motion, and limits per-parameter speed so gaze and head motion do not flip every keyframe. `sampleTimeline(...)` interpolates between keyframes by default, so custom render loops can request parameters for any elapsed time inside the segment.

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

For streaming assistant responses, do not wait for the final JSON before moving the model. Let the reply stream drive a low-confidence local expression first, then use the final structured LLM intent only as calibration:

```ts
import {
  Live2DExpressionOrchestrator,
  Live2DStreamingExpressionController,
} from "@kuguya-ai/nature-live2d";

const controller = new Live2DStreamingExpressionController({
  engine,
  model: pixiLive2DModel,
  runtime: "pixi-live2d-display",
  smoothingMs: 420,
  weight: 0.55,
});
const expression = new Live2DExpressionOrchestrator({
  target: controller,
  estimatorOptions: {
    baseIntensity: 0.75,
    promptBias: 0.28,
    durationMs: 1400,
  },
  stabilizerOptions: {
    holdMs: 520,
    neutralHoldMs: 900,
  },
  finalBlend: 0.55,
});

controller.start();

let assistantText = "";
for await (const chunk of assistantTextStream) {
  assistantText += chunk;
  expression.pushStreamText({
    promptText: `User: ${latestUserMessage}`,
    replyText: assistantText,
  });
}

const sustainTimer = window.setInterval(() => {
  expression.pushSustain({ intensityAmplitude: 0.045 });
}, 900);

try {
  const finalIntent = await analyzer.analyze(`User: ${latestUserMessage}\nYachiyo: ${assistantText}`);
  expression.pushFinalIntent(finalIntent);
} finally {
  window.clearInterval(sustainTimer);
}
```

This gives an immediate low-confidence expression during token streaming, sustains subtle local motion while final analysis is pending, and lets the final structured LLM result settle the expression without making the first visible reaction wait for a second LLM call. `Live2DExpressionOrchestrator` combines a local keyword estimator, emotion hysteresis, sustain pulses, and final-intent blending. If you want to provide your own stream classifier, call `controller.pushIntent(...)` directly or pass explicit intents through the orchestrator. `controller.pushText(...)` is still available for fast local analyzers; production apps should avoid putting a remote LLM analyzer in the per-token path.

For Node or build-time validation, scan a local directory:

```ts
import { scanLive2DResources } from "@kuguya-ai/nature-live2d/node";

const engine = await Live2DExpressionEngine.fromNodeDirectory("yachiyo");
const resources = await scanLive2DResources("yachiyo");
```

## Web Demo

Run a local browser demo that renders the bundled Yachiyo model through `pixi-live2d-display` and drives it with this package. The demo calls an OpenAI-compatible endpoint through local Vite middleware. The browser never receives the API key; `/api/chat-stream` proxies the assistant reply stream and `/api/analyze` performs the final emotion calibration:

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
