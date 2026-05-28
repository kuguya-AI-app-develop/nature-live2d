from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any, Protocol

from pydantic import ValidationError

from live2d_llm_expression.emotion.schema import EmotionIntent

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency is declared for installed package.
    load_dotenv = None

JsonObject = dict[str, Any]
HttpPost = Callable[[str, JsonObject, dict[str, str], float], JsonObject]

DEFAULT_SYSTEM_PROMPT = """You are a Live2D expression analyzer.
Return only one JSON object that matches this schema:
{
  "emotion": "neutral|happy|shy|embarrassed|angry|sad|crying|surprised|confused|teasing|sleepy|panic",
  "intensity": 0.0,
  "gaze": "left|right|up|down|down_left|down_right|null",
  "head": "lowered|raised|tilted_left|tilted_right|null",
  "eyes": "soft|wide|sleepy|closed_smile|null",
  "brows": "soft_up|angry|worried|null",
  "mouth": "small_smile|smile|open|frown|pout|null",
  "special_expression": "none|tears|tear_drop|closed_eye_smile|squeezed_eyes|null",
  "duration_ms": 1200
}
Use null for unknown optional fields. Keep intensity between 0 and 1.
Do not output Live2D parameter ids."""


class LLMAnalyzerError(RuntimeError):
    pass


class EmotionAnalyzer(Protocol):
    def analyze(self, text: str) -> EmotionIntent:
        ...


class OpenAICompatibleAnalyzer:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        timeout_seconds: float = 30.0,
        temperature: float = 0.0,
        http_post: HttpPost | None = None,
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        if not model:
            raise ValueError("model is required")

        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.temperature = temperature
        self.http_post = http_post or _urllib_post_json
        self.system_prompt = system_prompt

    @classmethod
    def from_env(cls) -> "OpenAICompatibleAnalyzer":
        if load_dotenv is not None:
            load_dotenv()

        api_key = os.getenv("LIVE2D_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
        model = os.getenv("LIVE2D_LLM_MODEL") or os.getenv("OPENAI_MODEL")
        base_url = (
            os.getenv("LIVE2D_LLM_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or "https://api.openai.com/v1"
        )

        missing = [
            name
            for name, value in (
                ("LIVE2D_LLM_API_KEY or OPENAI_API_KEY", api_key),
                ("LIVE2D_LLM_MODEL or OPENAI_MODEL", model),
            )
            if not value
        ]
        if missing:
            raise ValueError("missing environment variables: " + ", ".join(missing))

        return cls(api_key=api_key, model=model, base_url=base_url)

    def analyze(self, text: str) -> EmotionIntent:
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": text},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        response = self.http_post(
            _chat_completions_url(self.base_url),
            payload,
            headers,
            self.timeout_seconds,
        )
        content = _extract_message_content(response)
        return _parse_intent_json(content)


class MockEmotionAnalyzer:
    def analyze(self, text: str) -> EmotionIntent:
        normalized = text.lower()

        if _contains_any(normalized, ("哭", "泪", "tears", "cry")):
            return EmotionIntent(emotion="crying", intensity=0.75)
        if _contains_any(normalized, ("害羞", "脸红", "不好意思", "shy", "embarrass")):
            return EmotionIntent(
                emotion="shy",
                intensity=0.7,
                gaze="down_right",
                mouth="small_smile",
            )
        if _contains_any(normalized, ("开心", "高兴", "笑", "happy", "smile")):
            return EmotionIntent(emotion="happy", intensity=0.7, mouth="smile")
        if _contains_any(normalized, ("生气", "愤怒", "angry")):
            return EmotionIntent(emotion="angry", intensity=0.75)
        if _contains_any(normalized, ("伤心", "难过", "sad")):
            return EmotionIntent(emotion="sad", intensity=0.7)
        if _contains_any(normalized, ("吓", "惊", "surprise")):
            return EmotionIntent(emotion="surprised", intensity=0.75)
        if _contains_any(normalized, ("困", "睡", "sleepy")):
            return EmotionIntent(emotion="sleepy", intensity=0.7)
        if _contains_any(normalized, ("慌", "panic")):
            return EmotionIntent(emotion="panic", intensity=0.8)
        if _contains_any(normalized, ("调皮", "戏弄", "teasing")):
            return EmotionIntent(emotion="teasing", intensity=0.65)
        if _contains_any(normalized, ("困惑", "疑惑", "confused")):
            return EmotionIntent(emotion="confused", intensity=0.65)

        return EmotionIntent(emotion="neutral", intensity=0.5)


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    return any(needle in text for needle in needles)


def _chat_completions_url(base_url: str) -> str:
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url.rstrip('/')}/chat/completions"


def _urllib_post_json(
    url: str,
    payload: JsonObject,
    headers: dict[str, str],
    timeout_seconds: float,
) -> JsonObject:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise LLMAnalyzerError(f"LLM request failed with HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise LLMAnalyzerError(f"LLM request failed: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise LLMAnalyzerError("LLM response was not valid JSON") from exc


def _extract_message_content(response: JsonObject) -> str:
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMAnalyzerError("LLM response did not contain choices[0].message.content") from exc
    if not isinstance(content, str) or not content.strip():
        raise LLMAnalyzerError("LLM response content was empty")
    return content


def _parse_intent_json(content: str) -> EmotionIntent:
    cleaned = _strip_json_fence(content.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMAnalyzerError("LLM message content was not valid JSON") from exc

    try:
        return EmotionIntent.model_validate(data)
    except ValidationError as exc:
        raise LLMAnalyzerError(f"LLM intent JSON failed validation: {exc}") from exc


def _strip_json_fence(content: str) -> str:
    if not content.startswith("```"):
        return content
    lines = content.splitlines()
    if len(lines) >= 3 and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return content
