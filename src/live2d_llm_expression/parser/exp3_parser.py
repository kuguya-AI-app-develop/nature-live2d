from __future__ import annotations

import json
from pathlib import Path


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_expression(path: Path) -> dict[str, float]:
    data = _read_json(path)
    params: dict[str, float] = {}

    for item in data.get("Parameters", []) or []:
        parameter_id = item.get("Id")
        if not parameter_id or "Value" not in item:
            continue
        params[parameter_id] = float(item["Value"])

    return params


def parse_expression_name(path: Path) -> str:
    return path.name.removesuffix(".exp3.json")

