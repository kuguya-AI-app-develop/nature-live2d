from __future__ import annotations

import json
from pathlib import Path


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _source_ids(setting: dict) -> set[str]:
    return {
        item.get("Source", {}).get("Id")
        for item in setting.get("Input", []) or []
        if item.get("Source", {}).get("Target") == "Parameter"
        and item.get("Source", {}).get("Id")
    }


def _destination_ids(setting: dict) -> set[str]:
    return {
        item.get("Destination", {}).get("Id")
        for item in setting.get("Output", []) or []
        if item.get("Destination", {}).get("Target") == "Parameter"
        and item.get("Destination", {}).get("Id")
    }


def parse_physics_dependencies(path: Path) -> dict[str, set[str]]:
    data = _read_json(path)
    dependencies: dict[str, set[str]] = {}

    for setting in data.get("PhysicsSettings", []) or []:
        outputs = _destination_ids(setting)
        for source_id in _source_ids(setting):
            dependencies.setdefault(source_id, set()).update(outputs)

    return dependencies


def parse_physics_input_parameters(path: Path) -> set[str]:
    data = _read_json(path)
    inputs: set[str] = set()
    for setting in data.get("PhysicsSettings", []) or []:
        inputs.update(_source_ids(setting))
    return inputs


def parse_physics_downstream_parameters(path: Path) -> set[str]:
    data = _read_json(path)
    downstream: set[str] = set()
    for setting in data.get("PhysicsSettings", []) or []:
        downstream.update(_destination_ids(setting))
    return downstream

