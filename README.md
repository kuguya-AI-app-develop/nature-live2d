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

Out of scope for this MVP:

- real LLM calls
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

## Development

```bash
python3 -m pip install -e ".[dev]"
python3 -m pytest
```
