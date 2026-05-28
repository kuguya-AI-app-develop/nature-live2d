import type { EmotionAnalyzer, EmotionIntent } from "./types.js";

export class MockEmotionAnalyzer implements EmotionAnalyzer {
  analyze(text: string): EmotionIntent {
    const normalized = text.toLowerCase();
    if (containsAny(normalized, ["哭", "泪", "tears", "cry"])) return { emotion: "crying", intensity: 0.75 };
    if (containsAny(normalized, ["害羞", "脸红", "不好意思", "shy", "embarrass"])) {
      return { emotion: "shy", intensity: 0.7, gaze: "down_right", mouth: "small_smile" };
    }
    if (containsAny(normalized, ["开心", "高兴", "笑", "happy", "smile"])) {
      return { emotion: "happy", intensity: 0.7, mouth: "smile" };
    }
    if (containsAny(normalized, ["生气", "愤怒", "angry"])) return { emotion: "angry", intensity: 0.75 };
    if (containsAny(normalized, ["伤心", "难过", "sad"])) return { emotion: "sad", intensity: 0.7 };
    if (containsAny(normalized, ["吓", "惊", "surprise"])) return { emotion: "surprised", intensity: 0.75 };
    if (containsAny(normalized, ["困", "睡", "sleepy"])) return { emotion: "sleepy", intensity: 0.7 };
    if (containsAny(normalized, ["慌", "panic"])) return { emotion: "panic", intensity: 0.8 };
    if (containsAny(normalized, ["调皮", "戏弄", "teasing"])) return { emotion: "teasing", intensity: 0.65 };
    if (containsAny(normalized, ["困惑", "疑惑", "confused"])) return { emotion: "confused", intensity: 0.65 };
    return { emotion: "neutral", intensity: 0.5 };
  }
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

