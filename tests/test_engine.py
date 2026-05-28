import pytest

from live2d_llm_expression import EmotionIntent, Live2DExpressionEngine
from live2d_llm_expression.emotion.presets import BASE_EMOTION_PRESETS


def test_engine_generates_by_emotion(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_by_emotion("shy", intensity=0.7)

    assert result.emotion == "shy"
    assert result.intensity == pytest.approx(0.7)
    assert result.params["ParamAngleY"] == pytest.approx(-2.1)
    assert result.params["ParamAngleZ"] == pytest.approx(2.1)
    assert "ParamHairPhysics_L1" not in result.params
    assert result.warnings == []


def test_engine_builtin_emotions_are_warning_free(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)

    for emotion in BASE_EMOTION_PRESETS:
        result = engine.generate_by_emotion(emotion, intensity=0.7)
        assert result.warnings == []


def test_engine_neutral_does_not_force_blush(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_by_emotion("neutral", intensity=1.0)

    assert result.params["ParamCheek"] == pytest.approx(0.0)


def test_engine_generates_from_intent_with_modifiers(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_from_intent(
        EmotionIntent(
            emotion="happy",
            intensity=0.8,
            gaze="down_right",
            mouth="small_smile",
            special_expression="closed_eye_smile",
        )
    )

    assert result.params["ParamEyeBallX"] == pytest.approx(0.25)
    assert result.params["ParamEyeBallY"] == pytest.approx(-0.25)
    assert result.params["ParamMouthForm"] == pytest.approx(0.35)
    assert result.params["ParamExpression_3"] == pytest.approx(1.0)
    assert result.params["ParamExpression_1"] == pytest.approx(0.0)


def test_engine_generates_from_text_with_mock_analyzer(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_from_text("八千代有点害羞地笑了一下")

    assert result.emotion == "shy"
    assert result.params["ParamEyeBallX"] == pytest.approx(0.25)
    assert result.params["ParamMouthForm"] == pytest.approx(0.35)
    assert result.warnings == []


def test_engine_accepts_custom_text_analyzer(yachiyo_dir):
    class FakeAnalyzer:
        def analyze(self, text):
            return EmotionIntent(emotion="angry", intensity=0.8)

    engine = Live2DExpressionEngine.from_directory(yachiyo_dir, analyzer=FakeAnalyzer())
    result = engine.generate_from_text("anything")

    assert result.emotion == "angry"
    assert result.params["ParamMouthForm"] < 0
