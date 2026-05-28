from __future__ import annotations

from live2d_llm_expression.emotion.schema import EmotionIntent
from live2d_llm_expression.runtime.output import (
    TimelineExpressionResult,
    TimelineKeyframe,
)


def build_timeline(
    intent: EmotionIntent,
    *,
    neutral_params: dict[str, float],
    target_params: dict[str, float],
    warnings: list[str] | None = None,
) -> TimelineExpressionResult:
    duration_ms = intent.duration_ms
    if duration_ms < 4:
        keyframes = [
            TimelineKeyframe(t=0, params=dict(neutral_params)),
            TimelineKeyframe(t=duration_ms, params=dict(target_params)),
        ]
    else:
        keyframes = [
            TimelineKeyframe(t=0, params=dict(neutral_params)),
            TimelineKeyframe(t=round(duration_ms * 0.25), params=dict(target_params)),
            TimelineKeyframe(t=round(duration_ms * 0.75), params=dict(target_params)),
            TimelineKeyframe(t=duration_ms, params=dict(target_params)),
        ]

    return TimelineExpressionResult(
        emotion=intent.emotion,
        intensity=intent.intensity,
        duration_ms=duration_ms,
        keyframes=_dedupe_keyframes(keyframes),
        warnings=warnings or [],
    )


def _dedupe_keyframes(keyframes: list[TimelineKeyframe]) -> list[TimelineKeyframe]:
    by_time = {keyframe.t: keyframe for keyframe in keyframes}
    return [by_time[t] for t in sorted(by_time)]
