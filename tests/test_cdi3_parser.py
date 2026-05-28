from live2d_llm_expression.parser.cdi3_parser import parse_cdi_parameters


def test_cdi_parser_extracts_parameter_meta(yachiyo_dir):
    params = parse_cdi_parameters(yachiyo_dir / "八千代辉夜姬.cdi3.json")

    assert params["ParamMouthForm"].category == "ParamMouth"
    assert params["ParamMouthForm"].group == "嘴巴参数"
    assert params["ParamEyeLOpen"].category == "ParamEye"
    assert params["ParamEyeLOpen"].group == "眼睛参数"
    assert params["ParamExpression_1"].category == "ParamExpression"
    assert params["ParamExpression_4"].group == "表情"

