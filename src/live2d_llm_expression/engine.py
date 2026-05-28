from __future__ import annotations

from pathlib import Path
from typing import Protocol

from live2d_llm_expression.emotion.schema import EmotionIntent, EmotionName, SpecialExpressionName
from live2d_llm_expression.llm.analyzer import MockEmotionAnalyzer
from live2d_llm_expression.mapper.rule_mapper import RuleBasedExpressionMapper
from live2d_llm_expression.mapper.safety_clamp import clamp_params
from live2d_llm_expression.profile.model_profile import CharacterProfile
from live2d_llm_expression.profile.profile_builder import build_character_profile
from live2d_llm_expression.runtime.output import ExpressionResult
from live2d_llm_expression.scanner import scan_live2d_resources


class EmotionAnalyzer(Protocol):
    def analyze(self, text: str) -> EmotionIntent:
        ...


class Live2DExpressionEngine:
    def __init__(
        self,
        profile: CharacterProfile,
        mapper: RuleBasedExpressionMapper | None = None,
        analyzer: EmotionAnalyzer | None = None,
    ) -> None:
        self.profile = profile
        self.mapper = mapper or RuleBasedExpressionMapper()
        self.analyzer = analyzer or MockEmotionAnalyzer()

    @classmethod
    def from_directory(cls, root_dir: str | Path) -> "Live2DExpressionEngine":
        resources = scan_live2d_resources(root_dir)
        return cls(build_character_profile(resources))

    def generate_by_emotion(
        self,
        emotion: EmotionName,
        *,
        intensity: float = 0.5,
        gaze: str | None = None,
        head: str | None = None,
        eyes: str | None = None,
        brows: str | None = None,
        mouth: str | None = None,
        special_expression: SpecialExpressionName | None = None,
        duration_ms: int = 1200,
    ) -> ExpressionResult:
        intent = EmotionIntent(
            emotion=emotion,
            intensity=intensity,
            gaze=gaze,
            head=head,
            eyes=eyes,
            brows=brows,
            mouth=mouth,
            special_expression=special_expression,
            duration_ms=duration_ms,
        )
        return self.generate_from_intent(intent)

    def generate_from_intent(self, intent: EmotionIntent) -> ExpressionResult:
        raw_params = self.mapper.map_intent(intent)
        params, warnings = clamp_params(raw_params, self.profile)
        return ExpressionResult(
            emotion=intent.emotion,
            intensity=intent.intensity,
            duration_ms=intent.duration_ms,
            params=params,
            source_intent=intent,
            warnings=warnings,
        )

    def generate_from_text(self, text: str) -> ExpressionResult:
        return self.generate_from_intent(self.analyzer.analyze(text))
