from __future__ import annotations

from pydantic import BaseModel, Field

from live2d_llm_expression.emotion.schema import EmotionIntent


class ExpressionResult(BaseModel):
    emotion: str
    intensity: float
    duration_ms: int
    params: dict[str, float]
    source_intent: EmotionIntent
    warnings: list[str] = Field(default_factory=list)


class TimelineKeyframe(BaseModel):
    t: int
    params: dict[str, float]


class TimelineExpressionResult(BaseModel):
    emotion: str
    intensity: float
    duration_ms: int
    keyframes: list[TimelineKeyframe]
    warnings: list[str] = Field(default_factory=list)

