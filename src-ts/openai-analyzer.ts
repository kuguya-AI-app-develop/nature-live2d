import type { EmotionAnalyzer, EmotionIntent, EmotionName, EmotionStreamAnalyzer, EmotionToneName, SpecialExpressionName } from "./types.js";

const EMOTIONS = [
  "neutral",
  "happy",
  "shy",
  "embarrassed",
  "angry",
  "sad",
  "crying",
  "surprised",
  "confused",
  "teasing",
  "sleepy",
  "panic",
] as const satisfies readonly EmotionName[];

const SPECIAL_EXPRESSIONS = [
  "none",
  "tears",
  "tear_drop",
  "closed_eye_smile",
  "squeezed_eyes",
] as const satisfies readonly SpecialExpressionName[];

const TONES = [
  "concerned",
  "reassuring",
  "relieved",
  "proud",
  "playful",
  "bashful",
  "determined",
  "disappointed",
  "nervous",
  "excited",
  "grateful",
  "amused",
  "skeptical",
  "focused",
  "apologetic",
  "frustrated",
  "startled",
] as const satisfies readonly EmotionToneName[];

const SYSTEM_PROMPT = [
  "You convert dialogue into one semantic Live2D expression intent.",
  "Return JSON only. No markdown.",
  `emotion must be one of: ${EMOTIONS.join(", ")}.`,
  "intensity must be a number from 0 to 1.",
  "durationMs should be 800 to 2200.",
  `specialExpression may be one of: ${SPECIAL_EXPRESSIONS.join(", ")}.`,
  `tone is optional and may be one of: ${TONES.join(", ")}.`,
  "Do not output raw Live2D parameter IDs, keyframes, animation curves, or pose sequences.",
  "Prefer emotion, tone, intensity, durationMs, specialExpression, and summary.",
  "Include gaze, head, eyes, brows, or mouth when they help make the reaction visibly readable.",
  "Allowed pose values: gaze left/right/up/down/down_left/down_right; head lowered/raised/tilted_left/tilted_right; eyes soft/wide/sleepy; brows soft_up/angry/worried; mouth small_smile/smile/open/frown/pout/pressed/pucker/funnel/tongue/shrug.",
  "When both User and Assistant are present, choose the Live2D character's current visible reaction to the latest Assistant reply; use User text as context, not as the final display by itself.",
  "Prefer visible, characterful expressions over tiny subtle changes, but avoid cartoon exaggeration.",
  "Do not choose neutral when the assistant reply contains clear affective cues.",
  "Use panic for urgent concern or tense incident response, sad for empathy or disappointment, and shy for bashful praise reactions.",
  "Use tone to refine the broad emotion: concerned for worried attention, reassuring for calm comfort, proud/excited/grateful for different joy, playful/amused for teasing laughter, skeptical for doubtful confusion, focused/determined for action, bashful for shy praise, relieved for release after tension, nervous/startled for anxious surprise, apologetic/disappointed for hurt, frustrated for irritated pressure.",
  "For reassuring replies after urgent user distress, prefer a softer worried sad/confused/panic reaction; do not choose happy only because the reply is encouraging.",
  "For calming incident replies, choose tone reassuring or concerned so the character looks warm and focused rather than fully panicked.",
  "For panic, prefer wide eyes and worried brows; use squeezed_eyes only when the text explicitly implies bracing or squeezing eyes shut.",
].join("\n");

const STREAM_SYSTEM_PROMPT = [
  "Low-latency Live2D emotion director.",
  "Output NDJSON only: compact JSON lines, no markdown, no prose, no arrays.",
  "Emit 1 to 3 objects. The first object must be immediate and short.",
  `emotion must be one of: ${EMOTIONS.join(", ")}.`,
  "Use lowercase English emotion tokens exactly. intensity is 0 to 1. durationMs is 500 to 1600.",
  `specialExpression may be one of: ${SPECIAL_EXPRESSIONS.join(", ")}.`,
  `tone is optional and may be one of: ${TONES.join(", ")}.`,
  "Allowed keys: emotion, tone, intensity, durationMs, specialExpression, gaze, head, eyes, brows, mouth.",
  "Allowed pose values: gaze left/right/up/down/down_left/down_right; head lowered/raised/tilted_left/tilted_right; eyes soft/wide/sleepy; brows soft_up/angry/worried; mouth small_smile/smile/open/frown/pout/pressed/pucker/funnel/tongue/shrug.",
  "When Assistant text is present, track the latest Assistant tone as the current display; User text is context for the first reaction.",
  "Use specialExpression closed_eye_smile for strong happy, tears for crying, tear_drop for embarrassment. Use squeezed_eyes only for explicit bracing or squeezing eyes shut, not ordinary panic.",
  "For reassurance after urgent user distress, use softer worried sad/confused/panic rather than happy unless the reply is clearly celebratory.",
  "Use tone concerned/reassuring/proud/playful/bashful/relieved/nervous/determined/disappointed/excited/grateful/amused/skeptical/focused/apologetic/frustrated/startled to make the same emotion visibly different.",
  "Prefer visible, characterful reactions. Include pose keys in each object when they improve readability.",
  "Do not output raw Live2D parameter IDs, keyframes, animation curves, or pose sequences.",
  "Do not choose neutral when there is clear urgency, sadness, praise, embarrassment, surprise, or teasing.",
].join("\n");

const EMOTION_ALIASES: Record<string, EmotionName> = {
  高兴: "happy",
  开心: "happy",
  快乐: "happy",
  兴奋: "happy",
  喜悦: "happy",
  害羞: "shy",
  羞涩: "shy",
  不好意思: "shy",
  尴尬: "embarrassed",
  生气: "angry",
  愤怒: "angry",
  难过: "sad",
  悲伤: "sad",
  失落: "sad",
  哭: "crying",
  哭泣: "crying",
  惊讶: "surprised",
  惊喜: "surprised",
  震惊: "surprised",
  困惑: "confused",
  疑惑: "confused",
  调皮: "teasing",
  逗趣: "teasing",
  困倦: "sleepy",
  困: "sleepy",
  慌张: "panic",
  慌乱: "panic",
  紧张: "panic",
  惊慌: "panic",
  中性: "neutral",
  平静: "neutral",
};

const TONE_ALIASES: Record<string, EmotionToneName> = {
  担心: "concerned",
  关切: "concerned",
  关心: "concerned",
  安抚: "reassuring",
  安慰: "reassuring",
  温柔: "reassuring",
  放心: "relieved",
  松口气: "relieved",
  如释重负: "relieved",
  得意: "proud",
  自豪: "proud",
  骄傲: "proud",
  调侃: "playful",
  俏皮: "playful",
  玩笑: "playful",
  害羞: "bashful",
  羞涩: "bashful",
  坚定: "determined",
  决心: "determined",
  失望: "disappointed",
  沮丧: "disappointed",
  紧张: "nervous",
  不安: "nervous",
  兴奋: "excited",
  激动: "excited",
  感激: "grateful",
  感谢: "grateful",
  谢谢: "grateful",
  被逗笑: "amused",
  好笑: "amused",
  怀疑: "skeptical",
  半信半疑: "skeptical",
  专注: "focused",
  聚焦: "focused",
  抱歉: "apologetic",
  道歉: "apologetic",
  烦躁: "frustrated",
  挫败: "frustrated",
  吓到: "startled",
  惊吓: "startled",
};

export type OpenAICompatibleEmotionProvider = "auto" | "openai" | "mimo" | "custom";

export interface OpenAICompatibleEmotionAnalyzerOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  provider?: OpenAICompatibleEmotionProvider;
  extraBody?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAICompatibleEmotionAnalyzerResult extends EmotionIntent {
  summary?: string;
  rawContent?: string;
}

export interface OpenAICompatibleEmotionStreamEvent {
  type: "intent";
  intent: OpenAICompatibleEmotionAnalyzerResult;
}

export class OpenAICompatibleEmotionAnalyzer implements EmotionAnalyzer, EmotionStreamAnalyzer {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly extraBody: Record<string, unknown>;
  private readonly maxTokens: number | undefined;
  private readonly temperature: number;

  constructor(options: OpenAICompatibleEmotionAnalyzerOptions) {
    if (!options.baseUrl) throw new Error("OpenAI-compatible analyzer requires baseUrl");
    if (!options.apiKey) throw new Error("OpenAI-compatible analyzer requires apiKey");
    if (!options.model) throw new Error("OpenAI-compatible analyzer requires model");
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetcher = options.fetcher ?? fetch;
    this.extraBody = {
      ...resolveOpenAICompatibleProviderExtraBody({
        provider: options.provider,
        baseUrl: this.baseUrl,
        model: this.model,
      }),
      ...(options.extraBody ?? {}),
    };
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature ?? 0.2;
  }

  async analyze(text: string): Promise<OpenAICompatibleEmotionAnalyzerResult> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        ...this.extraBody,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              "Analyze this dialogue or assistant reply for the Live2D character reaction.",
              "Return keys: emotion, tone, intensity, durationMs, specialExpression, summary.",
              "Optional keys when strongly implied: gaze, head, eyes, brows, mouth.",
              "",
              text,
            ].join("\n"),
          },
        ],
        ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible analyzer failed: HTTP ${response.status}`);
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const rawContent = String(data.choices?.[0]?.message?.content ?? "");
    const parsed = parseJsonObject(rawContent);
    const intent = normalizeAnalyzerPayload(parsed);
    return { ...intent, summary: stringOrUndefined(parsed.summary), rawContent };
  }

  async *stream(text: string): AsyncGenerator<OpenAICompatibleEmotionStreamEvent> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: Math.min(this.temperature, 0.25),
        ...this.extraBody,
        stream: true,
        messages: [
          { role: "system", content: STREAM_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              "Analyze this dialogue for a smooth Live2D emotional reaction.",
              "Return NDJSON emotion events now. The first object should be the immediate visible reaction.",
              "",
              text,
            ].join("\n"),
          },
        ],
        ...(this.maxTokens ? { max_tokens: this.maxTokens } : { max_tokens: 260 }),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI-compatible emotion stream failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let contentBuffer = "";
    let rawContent = "";
    const pending: OpenAICompatibleEmotionStreamEvent[] = [];

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        sseBuffer = consumeOpenAISseLines(sseBuffer, (payload) => {
          if (payload === "[DONE]") return;
          const delta = parseOpenAIStreamDelta(payload);
          if (!delta) return;
          rawContent += delta;
          contentBuffer += delta;
          contentBuffer = consumeJsonObjects(contentBuffer, (object) => {
            const intent = normalizeAnalyzerPayload(object);
            pending.push({
              type: "intent",
              intent: { ...intent, summary: stringOrUndefined(object.summary), rawContent },
            });
          });
        });
        while (pending.length) {
          const event = pending.shift();
          if (event) yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }

    contentBuffer = consumeJsonObjects(contentBuffer, (object) => {
      const intent = normalizeAnalyzerPayload(object);
      pending.push({
        type: "intent",
        intent: { ...intent, summary: stringOrUndefined(object.summary), rawContent },
      });
    });
    while (pending.length) {
      const event = pending.shift();
      if (event) yield event;
    }
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  throw new Error("OpenAI-compatible analyzer returned non-JSON content");
}

function consumeOpenAISseLines(buffer: string, onData: (payload: string) => void): string {
  let cursor = 0;
  while (true) {
    const next = buffer.indexOf("\n", cursor);
    if (next === -1) break;
    const line = buffer.slice(cursor, next).trim();
    cursor = next + 1;
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload) onData(payload);
  }
  return buffer.slice(cursor);
}

function parseOpenAIStreamDelta(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
    };
    const delta = parsed.choices?.[0]?.delta;
    return [delta?.content, delta?.reasoning_content]
      .map((value) => String(value ?? ""))
      .filter(Boolean)
      .join("");
  } catch {
    return "";
  }
}

function consumeJsonObjects(buffer: string, onObject: (object: Record<string, unknown>) => void): string {
  let index = 0;
  while (index < buffer.length) {
    const start = buffer.indexOf("{", index);
    if (start === -1) return buffer.slice(index);

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = start; cursor < buffer.length; cursor += 1) {
      const char = buffer[cursor];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = buffer.slice(start, cursor + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              onObject(parsed as Record<string, unknown>);
            }
          } catch {}
          index = cursor + 1;
          break;
        }
      }
    }

    if (depth > 0) return buffer.slice(start);
    if (index <= start) index = start + 1;
  }
  return "";
}

function normalizeAnalyzerPayload(payload: Record<string, unknown>): EmotionIntent {
  return {
    emotion: normalizeEmotion(payload.emotion),
    tone: normalizeTone(payload.tone ?? payload.mood ?? payload.layer ?? payload.style),
    presetId: stringOrNull(payload.presetId ?? payload.preset_id),
    presetLabel: stringOrNull(payload.presetLabel ?? payload.preset_label),
    intensity: normalizeIntensity(payload.intensity),
    durationMs: normalizeDuration(payload.durationMs),
    gaze: stringOrNull(payload.gaze),
    head: stringOrNull(payload.head),
    eyes: stringOrNull(payload.eyes),
    brows: stringOrNull(payload.brows),
    mouth: stringOrNull(payload.mouth),
    specialExpression: normalizeSpecialExpression(payload.specialExpression),
  };
}

function normalizeEmotion(value: unknown): EmotionName {
  const text = String(value || "").trim().toLowerCase();
  if ((EMOTIONS as readonly string[]).includes(text)) return text as EmotionName;
  return EMOTION_ALIASES[text] ?? "neutral";
}

function normalizeSpecialExpression(value: unknown): SpecialExpressionName | null {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  return (SPECIAL_EXPRESSIONS as readonly string[]).includes(text) ? text as SpecialExpressionName : null;
}

function normalizeTone(value: unknown): EmotionToneName | null {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if ((TONES as readonly string[]).includes(text)) return text as EmotionToneName;
  return TONE_ALIASES[text] ?? null;
}

function normalizeIntensity(value: unknown): number {
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "low") return 0.35;
    if (lowered === "medium") return 0.65;
    if (lowered === "high") return 0.9;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.65;
  if (numeric > 1 && numeric <= 5) return Math.max(0, Math.min(1, numeric / 5));
  if (numeric > 5 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function normalizeDuration(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1200;
  return Math.round(Math.max(300, Math.min(5000, numeric)));
}

function stringOrNull(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

export function resolveOpenAICompatibleProviderExtraBody(options: {
  provider?: OpenAICompatibleEmotionProvider;
  baseUrl?: string;
  model?: string;
}): Record<string, unknown> {
  const provider = options.provider ?? "auto";
  if (provider === "openai" || provider === "custom") return {};
  const hint = `${options.baseUrl ?? ""} ${options.model ?? ""}`.toLowerCase();
  const isMimo = provider === "mimo" || hint.includes("mimo") || hint.includes("xiaomimimo");
  return isMimo ? { thinking: { type: "disabled" } } : {};
}
