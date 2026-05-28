from __future__ import annotations

from pathlib import Path

from live2d_llm_expression import Live2DExpressionEngine


def main() -> None:
    model_dir = Path(__file__).resolve().parents[1] / "yachiyo"
    engine = Live2DExpressionEngine.from_directory(model_dir)
    result = engine.generate_by_emotion("shy", intensity=0.7)
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()

