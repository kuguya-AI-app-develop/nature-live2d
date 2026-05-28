from __future__ import annotations

import argparse
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

from live2d_llm_expression.emotion.schema import (
    EmotionName,
    SpecialExpressionName,
)
from live2d_llm_expression.engine import Live2DExpressionEngine


class EmotionRequest(BaseModel):
    emotion: EmotionName
    intensity: float = 0.5
    gaze: str | None = None
    head: str | None = None
    eyes: str | None = None
    brows: str | None = None
    mouth: str | None = None
    special_expression: SpecialExpressionName | None = None
    duration_ms: int = 1200


class TextRequest(BaseModel):
    text: str


def create_app(
    model_dir: str | Path,
    *,
    use_env_analyzer: bool = False,
) -> FastAPI:
    engine = (
        Live2DExpressionEngine.from_directory_with_env_analyzer(model_dir)
        if use_env_analyzer
        else Live2DExpressionEngine.from_directory(model_dir)
    )
    app = FastAPI(title="Live2D LLM Expression", version="0.1.0")
    app.state.engine = engine

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/profile")
    def profile() -> dict:
        current_profile = app.state.engine.profile
        return {
            "character_id": current_profile.character_id,
            "character_name": current_profile.character_name,
            "resource_root": str(current_profile.resources.root_dir),
            "parameter_count": len(current_profile.parameters),
            "main_controls": current_profile.main_controls,
            "expression_presets": sorted(current_profile.expression_presets),
        }

    @app.post("/emotion")
    def emotion(request: EmotionRequest) -> dict:
        result = app.state.engine.generate_by_emotion(**request.model_dump())
        return result.model_dump(mode="json")

    @app.post("/text")
    def text(request: TextRequest) -> dict:
        result = app.state.engine.generate_from_text(request.text)
        return result.model_dump(mode="json")

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Live2D expression HTTP server.")
    parser.add_argument("--model", required=True, help="Path to a Live2D model resource directory.")
    parser.add_argument("--host", default="127.0.0.1", help="Server host.")
    parser.add_argument("--port", default=8765, type=int, help="Server port.")
    parser.add_argument(
        "--use-env-analyzer",
        action="store_true",
        help="Use LIVE2D_LLM_* or OPENAI_* environment variables for text analysis.",
    )
    args = parser.parse_args()

    import uvicorn

    app = create_app(args.model, use_env_analyzer=args.use_env_analyzer)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()

