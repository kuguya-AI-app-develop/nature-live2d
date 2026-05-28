import pytest

from live2d_llm_expression.llm import LLMAnalyzerError, OpenAICompatibleAnalyzer


def test_openai_compatible_analyzer_parses_json_response():
    calls = []

    def fake_post(url, payload, headers, timeout_seconds):
        calls.append((url, payload, headers, timeout_seconds))
        return {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"emotion":"shy","intensity":0.65,'
                            '"gaze":"down_right","mouth":"small_smile",'
                            '"duration_ms":1200}'
                        )
                    }
                }
            ]
        }

    analyzer = OpenAICompatibleAnalyzer(
        api_key="test-key",
        model="test-model",
        base_url="https://example.test/v1",
        http_post=fake_post,
    )

    intent = analyzer.analyze("八千代有点害羞")

    assert intent.emotion == "shy"
    assert intent.intensity == pytest.approx(0.65)
    assert intent.gaze == "down_right"
    assert intent.mouth == "small_smile"

    url, payload, headers, timeout_seconds = calls[0]
    assert url == "https://example.test/v1/chat/completions"
    assert payload["model"] == "test-model"
    assert payload["response_format"] == {"type": "json_object"}
    assert headers["Authorization"] == "Bearer test-key"
    assert timeout_seconds == pytest.approx(30.0)


def test_openai_compatible_analyzer_accepts_fenced_json():
    def fake_post(url, payload, headers, timeout_seconds):
        return {
            "choices": [
                {
                    "message": {
                        "content": (
                            "```json\n"
                            '{"emotion":"happy","intensity":0.8,"mouth":"smile"}'
                            "\n```"
                        )
                    }
                }
            ]
        }

    analyzer = OpenAICompatibleAnalyzer(
        api_key="test-key",
        model="test-model",
        http_post=fake_post,
    )

    intent = analyzer.analyze("开心地笑")

    assert intent.emotion == "happy"
    assert intent.mouth == "smile"


def test_openai_compatible_analyzer_raises_on_invalid_intent():
    def fake_post(url, payload, headers, timeout_seconds):
        return {
            "choices": [
                {"message": {"content": '{"emotion":"not_supported","intensity":0.5}'}}
            ]
        }

    analyzer = OpenAICompatibleAnalyzer(
        api_key="test-key",
        model="test-model",
        http_post=fake_post,
    )

    with pytest.raises(LLMAnalyzerError):
        analyzer.analyze("unknown")


def test_openai_compatible_analyzer_from_env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LIVE2D_LLM_API_KEY", "env-key")
    monkeypatch.setenv("LIVE2D_LLM_MODEL", "env-model")
    monkeypatch.setenv("LIVE2D_LLM_BASE_URL", "https://env.example/v1")

    analyzer = OpenAICompatibleAnalyzer.from_env()

    assert analyzer.api_key == "env-key"
    assert analyzer.model == "env-model"
    assert analyzer.base_url == "https://env.example/v1"

