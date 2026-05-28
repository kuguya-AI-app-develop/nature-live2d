from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from live2d_llm_expression.profile.parameter_profile import ParameterRange


class VTubeParameterMapping(BaseModel):
    input_name: str | None = None
    output_live2d: str
    input_range: tuple[float, float] | None = None
    output_range: tuple[float, float]
    smoothing: float | None = None
    use_breathing: bool = False


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_vtube_mappings(path: Path) -> dict[str, VTubeParameterMapping]:
    data = _read_json(path)
    mappings: dict[str, VTubeParameterMapping] = {}

    for item in data.get("ParameterSettings", []) or []:
        output_id = item.get("OutputLive2D")
        if not output_id:
            continue

        output_lower = float(item.get("OutputRangeLower", 0.0))
        output_upper = float(item.get("OutputRangeUpper", 0.0))

        input_range = None
        if "InputRangeLower" in item and "InputRangeUpper" in item:
            input_range = (
                float(item.get("InputRangeLower", 0.0)),
                float(item.get("InputRangeUpper", 0.0)),
            )

        mappings[output_id] = VTubeParameterMapping(
            input_name=item.get("Input"),
            output_live2d=output_id,
            input_range=input_range,
            output_range=(output_lower, output_upper),
            smoothing=(
                float(item["Smoothing"])
                if item.get("Smoothing") is not None
                else None
            ),
            use_breathing=bool(item.get("UseBreathing", False)),
        )

    return mappings


def parse_vtube_parameters(path: Path) -> dict[str, ParameterRange]:
    ranges: dict[str, ParameterRange] = {}
    for parameter_id, mapping in parse_vtube_mappings(path).items():
        lower, upper = mapping.output_range
        ranges[parameter_id] = ParameterRange.from_bounds(
            parameter_id,
            lower,
            upper,
            source="vtube",
        )
    return ranges


def parse_vtube_hotkeys(path: Path) -> dict[str, str]:
    data = _read_json(path)
    hotkeys: dict[str, str] = {}

    for item in data.get("Hotkeys", []) or []:
        if item.get("Action") != "ToggleExpression":
            continue
        name = item.get("Name")
        file_name = item.get("File")
        if name and file_name:
            hotkeys[name] = file_name

    return hotkeys

