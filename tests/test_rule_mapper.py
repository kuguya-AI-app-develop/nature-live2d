import pytest

from live2d_llm_expression.emotion.schema import EmotionIntent
from live2d_llm_expression.mapper.rule_mapper import RuleBasedExpressionMapper


def test_rule_mapper_blends_intensity_from_neutral():
    params = RuleBasedExpressionMapper().map_intent(
        EmotionIntent(emotion="shy", intensity=0.7)
    )

    assert params["ParamAngleY"] == pytest.approx(-2.1)
    assert params["ParamAngleZ"] == pytest.approx(2.1)
    assert params["ParamEyeLOpen"] == pytest.approx(0.825)
    assert params["ParamMouthForm"] == pytest.approx(0.315)
    assert params["ParamCheek"] == pytest.approx(0.525)


def test_rule_mapper_keeps_expression_layer_exclusive():
    mapper = RuleBasedExpressionMapper()
    params = mapper.map_intent(EmotionIntent(emotion="crying", intensity=0.5))
    expression_values = [
        params["ParamExpression_1"],
        params["ParamExpression_2"],
        params["ParamExpression_3"],
        params["ParamExpression_4"],
    ]

    assert expression_values == [1.0, 0.0, 0.0, 0.0]

    params = mapper.map_intent(
        EmotionIntent(
            emotion="happy",
            intensity=0.9,
            eyes="closed_smile",
            special_expression="closed_eye_smile",
        )
    )
    expression_values = [
        params["ParamExpression_1"],
        params["ParamExpression_2"],
        params["ParamExpression_3"],
        params["ParamExpression_4"],
    ]

    assert expression_values == [0.0, 0.0, 1.0, 0.0]


def test_rule_mapper_does_not_activate_crying_layer_below_threshold():
    params = RuleBasedExpressionMapper().map_intent(
        EmotionIntent(emotion="crying", intensity=0.49)
    )

    assert params["ParamExpression_1"] == 0.0
    assert sum(params[key] for key in params if key.startswith("ParamExpression_")) == 0.0


def test_rule_mapper_clamps_intensity_in_schema():
    params = RuleBasedExpressionMapper().map_intent(
        EmotionIntent(emotion="happy", intensity=2.0)
    )

    assert params["ParamMouthForm"] == pytest.approx(0.65)



@pytest.mark.parametrize('emotion', ['crying', 'panic', 'happy'])
def test_explicit_none_disables_automatic_special_expressions(emotion):
    intent = EmotionIntent(emotion=emotion, intensity=1, eyes='closed_smile', special_expression='none')
    params = RuleBasedExpressionMapper().map_intent(intent)
    assert all(params[f'ParamExpression_{index}'] == 0 for index in range(1, 5))


def test_omitted_special_expression_still_derives_tears():
    params = RuleBasedExpressionMapper().map_intent(EmotionIntent(emotion='crying', intensity=1))
    assert params['ParamExpression_1'] == 1
