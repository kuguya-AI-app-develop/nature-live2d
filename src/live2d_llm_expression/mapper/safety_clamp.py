from __future__ import annotations

from live2d_llm_expression.profile.model_profile import CharacterProfile


def clamp_params(
    params: dict[str, float],
    profile: CharacterProfile,
) -> tuple[dict[str, float], list[str]]:
    allowed = set(profile.main_controls)
    clamped: dict[str, float] = {}
    warnings: list[str] = []

    for parameter_id, value in params.items():
        if parameter_id not in allowed:
            warnings.append(f"removed non-controllable parameter: {parameter_id}")
            continue

        parameter_profile = profile.parameters.get(parameter_id)
        parameter_range = parameter_profile.range if parameter_profile else None
        if parameter_range is None:
            warnings.append(f"removed parameter without range: {parameter_id}")
            continue

        next_value = float(value)
        if next_value < parameter_range.min:
            warnings.append(
                f"clamped {parameter_id} from {next_value} to {parameter_range.min}"
            )
            next_value = parameter_range.min
        elif next_value > parameter_range.max:
            warnings.append(
                f"clamped {parameter_id} from {next_value} to {parameter_range.max}"
            )
            next_value = parameter_range.max

        clamped[parameter_id] = next_value

    return clamped, warnings

