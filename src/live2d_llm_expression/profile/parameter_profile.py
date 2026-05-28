from __future__ import annotations

from pydantic import BaseModel


class ParameterRange(BaseModel):
    id: str
    min: float
    max: float
    default: float | None = None
    source: str
    raw_min: float | None = None
    raw_max: float | None = None

    @classmethod
    def from_bounds(
        cls,
        parameter_id: str,
        lower: float,
        upper: float,
        *,
        source: str,
        default: float | None = None,
    ) -> "ParameterRange":
        return cls(
            id=parameter_id,
            min=min(lower, upper),
            max=max(lower, upper),
            default=default,
            source=source,
            raw_min=lower,
            raw_max=upper,
        )

    @property
    def reversed(self) -> bool:
        return (
            self.raw_min is not None
            and self.raw_max is not None
            and self.raw_min > self.raw_max
        )


class ParameterMeta(BaseModel):
    id: str
    name: str | None = None
    group: str | None = None
    category: str | None = None
    description: str | None = None


class ParameterProfile(BaseModel):
    id: str
    range: ParameterRange | None = None
    meta: ParameterMeta | None = None
    role: str = "unknown"
    controllable: bool = False
    downstream: bool = False

