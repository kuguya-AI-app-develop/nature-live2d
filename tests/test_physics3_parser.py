from live2d_llm_expression.parser.physics3_parser import (
    parse_physics_dependencies,
    parse_physics_downstream_parameters,
    parse_physics_input_parameters,
)


def test_physics_parser_builds_dependency_graph(yachiyo_dir):
    path = yachiyo_dir / "八千代辉夜姬.physics3.json"
    dependencies = parse_physics_dependencies(path)

    assert {"ParamAngle_HeadX", "ParamAngleModify_HeadX"} <= dependencies["ParamAngleX"]
    assert {"ParamEyeLSmile", "ParamEyeRSmile"} <= dependencies["ParamMouthForm"]
    assert "ParamBrowLY" in dependencies
    assert "ParamBrowRY" in dependencies


def test_physics_parser_separates_upstream_and_downstream(yachiyo_dir):
    path = yachiyo_dir / "八千代辉夜姬.physics3.json"
    inputs = parse_physics_input_parameters(path)
    downstream = parse_physics_downstream_parameters(path)

    assert "ParamAngleX" in inputs
    assert any(parameter_id.startswith("ParamHairPhysics_") for parameter_id in downstream)
    assert any(parameter_id.startswith("ParamDressPhysics_") for parameter_id in downstream)

