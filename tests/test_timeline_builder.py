import pytest

from live2d_llm_expression import Live2DExpressionEngine


def test_engine_generates_timeline_by_emotion(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_timeline_by_emotion("shy", intensity=0.7)

    assert result.emotion == "shy"
    assert result.intensity == pytest.approx(0.7)
    assert result.duration_ms == 1200
    assert [keyframe.t for keyframe in result.keyframes] == [0, 300, 900, 1200]
    assert result.keyframes[0].params["ParamMouthForm"] == pytest.approx(0.0)
    assert result.keyframes[1].params["ParamMouthForm"] == pytest.approx(0.315)
    assert result.keyframes[1].params == result.keyframes[2].params
    assert result.keyframes[2].params == result.keyframes[3].params
    assert result.warnings == []


def test_engine_timeline_starts_with_expression_layer_off(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_timeline_by_emotion("crying", intensity=0.8)

    assert result.keyframes[0].params["ParamExpression_1"] == pytest.approx(0.0)
    assert result.keyframes[1].params["ParamExpression_1"] == pytest.approx(1.0)
    assert result.keyframes[1].params["ParamExpression_2"] == pytest.approx(0.0)


def test_engine_generates_timeline_from_text(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_timeline_from_text("八千代有点害羞地笑了一下")

    assert result.emotion == "shy"
    assert result.keyframes[1].params["ParamEyeBallX"] == pytest.approx(0.25)
    assert result.warnings == []


def test_engine_timeline_dedupes_short_duration(yachiyo_dir):
    engine = Live2DExpressionEngine.from_directory(yachiyo_dir)
    result = engine.generate_timeline_by_emotion("happy", intensity=0.5, duration_ms=1)

    assert [keyframe.t for keyframe in result.keyframes] == [0, 1]
    assert result.keyframes[0].params["ParamMouthForm"] == pytest.approx(0.0)
    assert result.keyframes[1].params["ParamMouthForm"] > 0.0
