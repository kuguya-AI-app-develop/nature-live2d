from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from live2d_llm_expression.profile.parameter_profile import ParameterProfile


class Live2DResourceSet(BaseModel):
    root_dir: Path
    model3_path: Path | None = None
    cdi3_path: Path | None = None
    physics3_path: Path | None = None
    vtube_path: Path | None = None
    exp3_paths: list[Path] = Field(default_factory=list)
    ignored_paths: list[Path] = Field(default_factory=list)


class CharacterProfile(BaseModel):
    character_id: str
    character_name: str
    resources: Live2DResourceSet
    parameters: dict[str, ParameterProfile] = Field(default_factory=dict)
    main_controls: list[str] = Field(default_factory=list)
    expression_presets: dict[str, dict[str, float]] = Field(default_factory=dict)
    unsafe_patterns: list[str] = Field(default_factory=list)

