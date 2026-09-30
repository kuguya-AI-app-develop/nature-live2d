import pytest
from pydantic import ValidationError
from live2d_llm_expression.emotion.schema import EmotionIntent


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_intensity_must_be_finite(value):
    with pytest.raises(ValidationError):
        EmotionIntent(emotion='happy', intensity=value)
