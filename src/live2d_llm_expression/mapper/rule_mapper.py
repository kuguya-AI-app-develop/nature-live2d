from __future__ import annotations

from live2d_llm_expression.emotion.presets import BASE_EMOTION_PRESETS
from live2d_llm_expression.emotion.schema import EmotionIntent
from live2d_llm_expression.mapper.expression_layer import (
    apply_special_expression,
    resolve_special_expression,
)


class RuleBasedExpressionMapper:
    def map_intent(self, intent: EmotionIntent) -> dict[str, float]:
        neutral = BASE_EMOTION_PRESETS["neutral"]
        target = BASE_EMOTION_PRESETS.get(intent.emotion, neutral)
        intensity = intent.intensity
        params: dict[str, float] = {}

        for parameter_id in sorted(set(neutral) | set(target)):
            if parameter_id.startswith("ParamExpression_"):
                continue
            base_value = neutral.get(parameter_id, 0.0)
            target_value = target.get(parameter_id, base_value)
            params[parameter_id] = base_value + (target_value - base_value) * intensity

        self._apply_intent_modifiers(params, intent)
        return apply_special_expression(params, resolve_special_expression(intent))

    def _apply_intent_modifiers(
        self,
        params: dict[str, float],
        intent: EmotionIntent,
    ) -> None:
        gaze_map = {
            "left": {"ParamEyeBallX": -0.35},
            "right": {"ParamEyeBallX": 0.35},
            "up": {"ParamEyeBallY": 0.3},
            "down": {"ParamEyeBallY": -0.3},
            "down_left": {"ParamEyeBallX": -0.25, "ParamEyeBallY": -0.25},
            "down_right": {"ParamEyeBallX": 0.25, "ParamEyeBallY": -0.25},
        }
        head_map = {
            "lowered": {"ParamAngleY": -3.0},
            "raised": {"ParamAngleY": 3.0},
            "tilted_left": {"ParamAngleZ": 3.0},
            "tilted_right": {"ParamAngleZ": -3.0},
        }
        eyes_map = {
            "soft": {"ParamEyeLOpen": 0.85, "ParamEyeROpen": 0.85},
            "wide": {"ParamEyeLOpen": 1.35, "ParamEyeROpen": 1.35},
            "sleepy": {"ParamEyeLOpen": 0.45, "ParamEyeROpen": 0.45},
        }
        brows_map = {
            "soft_up": {"ParamBrowLY": 0.25, "ParamBrowRY": 0.25},
            "angry": {"ParamBrowLY": -0.55, "ParamBrowRY": -0.55},
            "worried": {"ParamBrowLY": 0.4, "ParamBrowRY": 0.4},
        }
        mouth_map = {
            "small_smile": {"ParamMouthForm": 0.35, "ParamMouthOpenY": 0.05},
            "smile": {"ParamMouthForm": 0.65, "ParamMouthOpenY": 0.18},
            "open": {"ParamMouthOpenY": 0.8},
            "frown": {"ParamMouthForm": -0.45, "ParamMouthOpenY": 0.05},
            "pout": {"ParamMouthPuckerWiden": -0.4, "ParamMouthFunnel": 0.35},
        }

        for mapping, key in (
            (gaze_map, intent.gaze),
            (head_map, intent.head),
            (eyes_map, intent.eyes),
            (brows_map, intent.brows),
            (mouth_map, intent.mouth),
        ):
            if key in mapping:
                params.update(mapping[key])

