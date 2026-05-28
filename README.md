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
- generate simple expression timelines with neutral and target keyframes

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
applyParamsToLive2DModel(cubismModel, result.params);

const timeline = await engine.generateTimelineFromText("八千代有点害羞地笑了一下");
applyParamsToLive2DModel(cubismModel, sampleTimeline(timeline, 300));
```

For Node or build-time validation, scan a local directory:

```ts
import { scanLive2DResources } from "@kuguya-ai/nature-live2d/node";

const engine = await Live2DExpressionEngine.fromNodeDirectory("yachiyo");
const resources = await scanLive2DResources("yachiyo");
```

## Development

```bash
python3 -m pip install -e ".[dev]"
python3 -m pytest
npm install
npm run build
npm run test:ts
```
