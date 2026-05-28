from __future__ import annotations

import json

from live2d_llm_expression.parser.cdi3_parser import parse_cdi_parameters
from live2d_llm_expression.parser.exp3_parser import parse_expression, parse_expression_name
from live2d_llm_expression.parser.physics3_parser import (
    parse_physics_downstream_parameters,
    parse_physics_input_parameters,
)
from live2d_llm_expression.parser.vtube_parser import parse_vtube_parameters
from live2d_llm_expression.profile.model_profile import CharacterProfile, Live2DResourceSet
from live2d_llm_expression.profile.parameter_profile import (
    ParameterProfile,
    ParameterRange,
)
from live2d_llm_expression.profile.yachiyo_defaults import (
    YACHIYO_FALLBACK_RANGES,
    YACHIYO_MAIN_CONTROLS,
    YACHIYO_RANGE_OVERRIDES,
    YACHIYO_UNSAFE_PATTERNS,
)


def build_character_profile(resource_set: Live2DResourceSet) -> CharacterProfile:
    ranges: dict[str, ParameterRange] = {}
    if resource_set.vtube_path:
        ranges.update(parse_vtube_parameters(resource_set.vtube_path))

    for parameter_id, (lower, upper) in YACHIYO_FALLBACK_RANGES.items():
        ranges.setdefault(
            parameter_id,
            ParameterRange.from_bounds(
                parameter_id,
                lower,
                upper,
                source="manual",
            ),
        )
    for parameter_id, (lower, upper) in YACHIYO_RANGE_OVERRIDES.items():
        ranges[parameter_id] = ParameterRange.from_bounds(
            parameter_id,
            lower,
            upper,
            source="manual_override",
        )

    metas = {}
    if resource_set.cdi3_path:
        metas = parse_cdi_parameters(resource_set.cdi3_path)

    physics_inputs: set[str] = set()
    physics_downstream: set[str] = set()
    if resource_set.physics3_path:
        physics_inputs = parse_physics_input_parameters(resource_set.physics3_path)
        physics_downstream = parse_physics_downstream_parameters(resource_set.physics3_path)

    expression_presets = {
        parse_expression_name(path): parse_expression(path)
        for path in resource_set.exp3_paths
    }

    parameter_ids = set(YACHIYO_MAIN_CONTROLS)
    parameter_ids.update(ranges)
    parameter_ids.update(metas)
    parameter_ids.update(physics_inputs)
    parameter_ids.update(physics_downstream)
    for preset in expression_presets.values():
        parameter_ids.update(preset)

    main_controls = list(YACHIYO_MAIN_CONTROLS)
    parameters: dict[str, ParameterProfile] = {}

    for parameter_id in sorted(parameter_ids):
        controllable = parameter_id in main_controls
        downstream = parameter_id in physics_downstream and not controllable
        parameters[parameter_id] = ParameterProfile(
            id=parameter_id,
            range=ranges.get(parameter_id),
            meta=metas.get(parameter_id),
            role=_infer_role(
                parameter_id,
                metas.get(parameter_id).category if metas.get(parameter_id) else None,
                downstream,
            ),
            controllable=controllable,
            downstream=downstream,
        )

    character_id = resource_set.root_dir.name
    character_name = character_id
    if resource_set.vtube_path:
        data = json.loads(resource_set.vtube_path.read_text(encoding="utf-8"))
        character_name = data.get("Name") or character_name

    return CharacterProfile(
        character_id=character_id,
        character_name=character_name,
        resources=resource_set,
        parameters=parameters,
        main_controls=main_controls,
        expression_presets=expression_presets,
        unsafe_patterns=list(YACHIYO_UNSAFE_PATTERNS),
    )


def _infer_role(parameter_id: str, category: str | None, downstream: bool) -> str:
    if downstream:
        return "physics_downstream"
    if parameter_id.startswith("ParamExpression_"):
        return "special_expression"
    if parameter_id.startswith("ParamHide_") or "Hide_" in parameter_id:
        return "visibility"
    if parameter_id == "ParamBreath":
        return "breath"
    if parameter_id.startswith("ParamBodyAngle"):
        return "body"
    if parameter_id.startswith("ParamAngle"):
        return "head"
    if parameter_id.startswith("ParamEye"):
        return "eye"
    if parameter_id.startswith("ParamBrow"):
        return "brow"
    if parameter_id.startswith(("ParamMouth", "ParamJaw", "ParamTongue")):
        return "mouth"
    if parameter_id.startswith("ParamCheek"):
        return "cheek"
    if category:
        lowered = category.lower()
        if "eye" in lowered:
            return "eye"
        if "mouth" in lowered:
            return "mouth"
        if "brow" in lowered:
            return "brow"
        if "expression" in lowered:
            return "special_expression"
    return "unknown"
