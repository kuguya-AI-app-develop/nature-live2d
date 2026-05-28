from live2d_llm_expression.parser.exp3_parser import parse_expression, parse_expression_name


def test_exp3_parser_extracts_expression_params(yachiyo_dir):
    expectations = {
        "眼泪.exp3.json": ("ParamExpression_1", 0.0),
        "泪珠.exp3.json": ("ParamExpression_2", 1.0),
        "笑咪咪.exp3.json": ("ParamExpression_3", 1.0),
        "眯眯眼.exp3.json": ("ParamExpression_4", 1.0),
    }
    hide_keys = {
        "ParamHide_EyesL1",
        "ParamHighLightHide_EyesL1",
        "ParamHide_EyeSocket",
        "ParamHide_EyeSocket2",
    }

    for file_name, (active_key, expected_hide_value) in expectations.items():
        params = parse_expression(yachiyo_dir / file_name)
        assert len(params) == 8
        assert params[active_key] == 1.0
        assert sum(params[key] for key in params if key.startswith("ParamExpression_")) == 1.0
        assert {params[key] for key in hide_keys} == {expected_hide_value}


def test_exp3_parser_derives_name_from_filename(yachiyo_dir):
    assert parse_expression_name(yachiyo_dir / "眯眯眼.exp3.json") == "眯眯眼"

