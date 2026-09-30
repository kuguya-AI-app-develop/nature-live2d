import pytest

from live2d_llm_expression.mapper.safety_clamp import clamp_params
from live2d_llm_expression.profile.profile_builder import build_character_profile
from live2d_llm_expression.scanner import scan_live2d_resources


def test_safety_clamp_removes_unknown_param(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    params, warnings = clamp_params({"ParamHairPhysics_L1": 0.5}, profile)

    assert params == {}
    assert warnings


def test_safety_clamp_clamps_out_of_range_param(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    params, warnings = clamp_params({"ParamMouthOpenY": 99.0}, profile)

    assert params["ParamMouthOpenY"] == pytest.approx(2.0999999046325684)
    assert warnings


def test_safety_clamp_handles_reversed_eye_ball_x_range(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    params, warnings = clamp_params({"ParamEyeBallX": 2.5}, profile)

    assert params["ParamEyeBallX"] == pytest.approx(1.0)
    assert warnings


def test_safety_clamp_keeps_expression_fallback_ranges(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    params, warnings = clamp_params({"ParamExpression_1": 2.0}, profile)

    assert params["ParamExpression_1"] == pytest.approx(1.0)
    assert warnings



@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_safety_clamp_removes_non_finite_params(yachiyo_dir, value):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    params, warnings = clamp_params({'ParamAngleX': value, 'ParamAngleY': 0}, profile)
    assert params == {'ParamAngleY': 0}
    assert warnings == ['removed non-finite parameter: ParamAngleX']


@pytest.mark.parametrize('lower,upper', [(float('nan'), 1), (0, float('inf')), (1, -1)])
def test_safety_clamp_rejects_invalid_ranges(yachiyo_dir, lower, upper):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    profile.parameters['ParamAngleX'].range.min = lower
    profile.parameters['ParamAngleX'].range.max = upper
    params, warnings = clamp_params({'ParamAngleX': 0}, profile)
    assert params == {}
    assert warnings == ['removed parameter with invalid range: ParamAngleX']
