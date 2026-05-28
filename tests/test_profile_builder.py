from live2d_llm_expression.profile.profile_builder import build_character_profile
from live2d_llm_expression.scanner import scan_live2d_resources


def test_profile_builder_merges_yachiyo_sources(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))

    assert profile.character_id == "yachiyo"
    assert profile.character_name
    assert "ParamMouthForm" in profile.parameters
    assert profile.parameters["ParamMouthForm"].range is not None
    assert profile.parameters["ParamMouthForm"].meta is not None
    assert profile.parameters["ParamMouthForm"].controllable is True
    assert profile.parameters["ParamCheek"].range.min == 0.0
    assert profile.parameters["ParamCheek"].range.source == "manual_override"
    assert profile.parameters["ParamExpression_1"].range.source == "manual"
    assert len(profile.expression_presets) == 4
    assert profile.main_controls


def test_profile_builder_marks_downstream_physics_as_not_controllable(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))
    downstream_ids = [
        parameter_id
        for parameter_id, parameter in profile.parameters.items()
        if parameter_id.startswith("ParamHairPhysics_") and parameter.downstream
    ]

    assert downstream_ids
    assert all(parameter_id not in profile.main_controls for parameter_id in downstream_ids)


def test_profile_builder_preserves_exp3_preset_payloads(yachiyo_dir):
    profile = build_character_profile(scan_live2d_resources(yachiyo_dir))

    closed_eye_smile = profile.expression_presets["笑咪咪"]
    assert closed_eye_smile["ParamExpression_3"] == 1.0
    assert closed_eye_smile["ParamExpression_1"] == 0.0
    assert closed_eye_smile["ParamHide_EyesL1"] == 1.0
