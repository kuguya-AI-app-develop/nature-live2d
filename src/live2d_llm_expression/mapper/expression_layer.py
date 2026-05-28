from __future__ import annotations

from live2d_llm_expression.emotion.schema import EmotionIntent, SpecialExpressionName

EXPRESSION_LAYER_KEYS = [
    "ParamExpression_1",
    "ParamExpression_2",
    "ParamExpression_3",
    "ParamExpression_4",
    "ParamHide_EyesL1",
    "ParamHighLightHide_EyesL1",
    "ParamHide_EyeSocket",
    "ParamHide_EyeSocket2",
]

EXPRESSION_LAYER_PRESETS: dict[str, dict[str, float]] = {
    "none": {
        "ParamExpression_1": 0.0,
        "ParamExpression_2": 0.0,
        "ParamExpression_3": 0.0,
        "ParamExpression_4": 0.0,
        "ParamHide_EyesL1": 0.0,
        "ParamHighLightHide_EyesL1": 0.0,
        "ParamHide_EyeSocket": 0.0,
        "ParamHide_EyeSocket2": 0.0,
    },
    "tears": {
        "ParamExpression_1": 1.0,
        "ParamExpression_2": 0.0,
        "ParamExpression_3": 0.0,
        "ParamExpression_4": 0.0,
        "ParamHide_EyesL1": 0.0,
        "ParamHighLightHide_EyesL1": 0.0,
        "ParamHide_EyeSocket": 0.0,
        "ParamHide_EyeSocket2": 0.0,
    },
    "tear_drop": {
        "ParamExpression_1": 0.0,
        "ParamExpression_2": 1.0,
        "ParamExpression_3": 0.0,
        "ParamExpression_4": 0.0,
        "ParamHide_EyesL1": 1.0,
        "ParamHighLightHide_EyesL1": 1.0,
        "ParamHide_EyeSocket": 1.0,
        "ParamHide_EyeSocket2": 1.0,
    },
    "closed_eye_smile": {
        "ParamExpression_1": 0.0,
        "ParamExpression_2": 0.0,
        "ParamExpression_3": 1.0,
        "ParamExpression_4": 0.0,
        "ParamHide_EyesL1": 1.0,
        "ParamHighLightHide_EyesL1": 1.0,
        "ParamHide_EyeSocket": 1.0,
        "ParamHide_EyeSocket2": 1.0,
    },
    "squeezed_eyes": {
        "ParamExpression_1": 0.0,
        "ParamExpression_2": 0.0,
        "ParamExpression_3": 0.0,
        "ParamExpression_4": 1.0,
        "ParamHide_EyesL1": 1.0,
        "ParamHighLightHide_EyesL1": 1.0,
        "ParamHide_EyeSocket": 1.0,
        "ParamHide_EyeSocket2": 1.0,
    },
}


def resolve_special_expression(intent: EmotionIntent) -> SpecialExpressionName:
    if intent.special_expression and intent.special_expression != "none":
        return intent.special_expression
    if intent.emotion == "crying" and intent.intensity >= 0.5:
        return "tears"
    if (
        intent.emotion in {"happy", "teasing"}
        and intent.intensity >= 0.8
        and intent.eyes == "closed_smile"
    ):
        return "closed_eye_smile"
    if intent.emotion == "panic" and intent.intensity >= 0.7:
        return "squeezed_eyes"
    return "none"


def apply_special_expression(
    params: dict[str, float],
    special_expression: str,
) -> dict[str, float]:
    next_params = dict(params)
    next_params.update(EXPRESSION_LAYER_PRESETS.get(special_expression, EXPRESSION_LAYER_PRESETS["none"]))
    return next_params

