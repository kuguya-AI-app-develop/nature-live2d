import pytest

from live2d_llm_expression.parser.vtube_parser import (
    parse_vtube_hotkeys,
    parse_vtube_parameters,
)


def test_vtube_parser_extracts_ranges(yachiyo_dir):
    ranges = parse_vtube_parameters(yachiyo_dir / "八千代辉夜姬.vtube.json")

    assert ranges["ParamMouthOpenY"].min == pytest.approx(0.0)
    assert ranges["ParamMouthOpenY"].max == pytest.approx(2.0999999046325684)
    assert ranges["ParamEyeLOpen"].max == pytest.approx(1.899999976158142)
    assert ranges["ParamEyeROpen"].max == pytest.approx(1.899999976158142)
    assert ranges["ParamMouthForm"].min == pytest.approx(-1.0)
    assert ranges["ParamMouthForm"].max == pytest.approx(1.0)


def test_vtube_parser_preserves_reversed_eye_x_range(yachiyo_dir):
    ranges = parse_vtube_parameters(yachiyo_dir / "八千代辉夜姬.vtube.json")
    eye_x = ranges["ParamEyeBallX"]

    assert eye_x.raw_min == pytest.approx(1.0)
    assert eye_x.raw_max == pytest.approx(-1.0)
    assert eye_x.reversed is True
    assert eye_x.min == pytest.approx(-1.0)
    assert eye_x.max == pytest.approx(1.0)


def test_vtube_parser_extracts_expression_hotkeys(yachiyo_dir):
    hotkeys = parse_vtube_hotkeys(yachiyo_dir / "八千代辉夜姬.vtube.json")

    assert len(hotkeys) == 4
    assert set(hotkeys.values()) == {
        "眯眯眼.exp3.json",
        "泪珠.exp3.json",
        "眼泪.exp3.json",
        "笑咪咪.exp3.json",
    }

