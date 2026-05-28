import type { EmotionAnalyzer, EmotionIntent, EmotionName, SpecialExpressionName } from "./types.js";

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

const SYSTEM_PROMPT = [
  "You convert dialogue into one semantic Live2D expression intent.",
  "Return JSON only. No markdown.",
  `emotion must be one of: ${EMOTIONS.join(", ")}.`,
  "intensity must be a number from 0 to 1.",
  "durationMs should be 800 to 2200.",
  `specialExpression may be one of: ${SPECIAL_EXPRESSIONS.join(", ")}.`,
  "Do not output raw Live2D parameter IDs, keyframes, animation curves, or pose sequences.",
  "Prefer emotion, intensity, durationMs, specialExpression, and summary.",
  "Only include gaze, head, eyes, brows, or mouth when the text strongly and explicitly implies that pose.",
  "Prefer subtle natural expressions over extreme reactions unless the dialogue is clearly intense.",
  "Do not choose neutral when the assistant reply contains clear affective cues.",
  "Use panic for urgent concern or tense incident response, sad for empathy or disappointment, and shy for bashful praise reactions.",
].join("\n");

export interface OpenAICompatibleEmotionAnalyzerOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAICompatibleEmotionAnalyzerResult extends EmotionIntent {
  summary?: string;
  rawContent?: string;
}

export class OpenAICompatibleEmotionAnalyzer implements EmotionAnalyzer {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              "Analyze this dialogue or assistant reply for the Live2D character reaction.",
              "Return keys: emotion, intensity, durationMs, specialExpression, summary.",
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

function normalizeAnalyzerPayload(payload: Record<string, unknown>): EmotionIntent {
  return {
    emotion: normalizeEmotion(payload.emotion),
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
  return (EMOTIONS as readonly string[]).includes(text) ? text as EmotionName : "neutral";
}

function normalizeSpecialExpression(value: unknown): SpecialExpressionName | null {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  return (SPECIAL_EXPRESSIONS as readonly string[]).includes(text) ? text as SpecialExpressionName : null;
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
