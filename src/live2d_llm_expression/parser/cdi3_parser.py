from __future__ import annotations

import json
from pathlib import Path

from live2d_llm_expression.profile.parameter_profile import ParameterMeta


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_cdi_parameters(path: Path) -> dict[str, ParameterMeta]:
    data = _read_json(path)
    group_names = {
        item.get("Id"): item.get("Name")
        for item in data.get("ParameterGroups", []) or []
        if item.get("Id")
    }
    params: dict[str, ParameterMeta] = {}

    for item in data.get("Parameters", []) or []:
        parameter_id = item.get("Id")
        if not parameter_id:
            continue
        group_id = item.get("GroupId") or None
        params[parameter_id] = ParameterMeta(
            id=parameter_id,
            name=item.get("Name"),
            group=group_names.get(group_id) or group_id,
            category=group_id,
        )

    return params

