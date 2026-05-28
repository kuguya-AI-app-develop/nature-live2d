from __future__ import annotations

from live2d_llm_expression.emotion.schema import EmotionIntent


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

