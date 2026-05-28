from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, field_validator

EmotionName = Literal[
    "neutral",
    "happy",
    "shy",
    "embarrassed",
    "angry",
    "sad",
    "crying",
    "surprised",
    "confused",
    "teasing",
    "sleepy",
    "panic",
]

SpecialExpressionName = Literal[
    "none",
    "tears",
    "tear_drop",
    "closed_eye_smile",
    "squeezed_eyes",
]


class EmotionIntent(BaseModel):
    emotion: EmotionName
    intensity: float = 0.5
    gaze: str | None = None
    head: str | None = None
    eyes: str | None = None
    brows: str | None = None
    mouth: str | None = None
    special_expression: SpecialExpressionName | None = None
    duration_ms: int = 1200

    @field_validator("intensity")
    @classmethod
    def clamp_intensity(cls, value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    @field_validator("duration_ms")
    @classmethod
    def positive_duration(cls, value: int) -> int:
        return max(1, int(value))

