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

Out of scope for this MVP:

- VTube Studio WebSocket control
- moc3 parsing
- timeline animation

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

Example:

```bash
curl -X POST http://127.0.0.1:8765/emotion \
  -H 'Content-Type: application/json' \
  -d '{"emotion":"shy","intensity":0.7}'
```

## Development

```bash
python3 -m pip install -e ".[dev]"
python3 -m pytest
```
