import './styles.css';

import {
  createLive2DRealtimeMotionDirector,
  type EmotionAnalyzer,
  type EmotionIntent,
  type EmotionStreamAnalyzer,
  Live2DExpressionEngine,
  type Live2DMotionCapability,
  playTimelineOnLive2DModel,
  type Live2DParameterTarget,
  type Live2DRealtimeMotionDirector,
  type Live2DRuntimeKind,
  type RealtimeMotionFrameMeta,
  type TimelineExpressionResult,
} from '../../src-ts/index.ts';

type PixiApplication = {
  renderer: { resize: (width: number, height: number) => void };
  stage: { addChild: (child: unknown) => void };
  ticker?: {
    add: (callback: () => void) => void;
    remove: (callback: () => void) => void;
  };
};

type PixiLive2DModel = Live2DParameterTarget & {
  anchor?: { set: (x: number, y: number) => void };
  scale?: { set: (value: number) => void };
  x: number;
  y: number;
  getLocalBounds?: () => { width: number; height: number };
};

type DemoWindow = Window & {
  PIXI?: any;
  Live2DCubismCore?: unknown;
  process?: { env?: Record<string, string> };
};

type DemoStatus = {
  ready: boolean;
  runtime: Live2DRuntimeKind;
  emotion: string;
  keyframes: number;
  parameterCount: number;
  capabilityScore?: number;
  capabilityFeatures?: string[];
  llmSummary?: string;
  error: string;
};

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AnalyzeResponse = {
  ok?: boolean;
  model?: string;
  intent?: EmotionIntent & { summary?: string; rawContent?: string };
  summary?: string;
  error?: string;
};

type ChatStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

type EmotionStreamEvent =
  | { type: 'intent'; intent: EmotionIntent & { summary?: string }; summary?: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

const MODEL_ROOT = '/yachiyo/';
const MODEL3 = '八千代辉夜姬.model3.json';
const RESOURCE_URLS = {
  rootUrl: MODEL_ROOT,
  model3Path: MODEL3,
  cdi3Path: '八千代辉夜姬.cdi3.json',
  physics3Path: '八千代辉夜姬.physics3.json',
  vtubePath: '八千代辉夜姬.vtube.json',
  exp3Paths: ['眼泪.exp3.json', '泪珠.exp3.json', '笑咪咪.exp3.json', '眯眯眼.exp3.json'],
};
const RUNTIME_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/pixi.js@6/dist/browser/pixi.min.js',
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.5.0-beta/dist/cubism4.min.js',
];

const canvas = getElement<HTMLCanvasElement>('live2d-canvas');
const stageShell = document.querySelector<HTMLElement>('.stage-shell');
const runtimeInput = getElement<HTMLSelectElement>('runtime');
const chatLog = getElement<HTMLElement>('chat-log');
const chatForm = getElement<HTMLFormElement>('chat-form');
const chatInput = getElement<HTMLTextAreaElement>('chat-input');
const intensityInput = getElement<HTMLInputElement>('intensity');
const durationInput = getElement<HTMLInputElement>('duration');
const streamWeightInput = getElement<HTMLInputElement>('stream-weight');
const smoothingInput = getElement<HTMLInputElement>('smoothing');
const stabilityInput = getElement<HTMLInputElement>('stability');
const expressivenessInput = getElement<HTMLInputElement>('expressiveness');
const modelName = getElement<HTMLElement>('model-name');
const capabilityOutput = getElement<HTMLElement>('capability');
const emotionOutput = getElement<HTMLElement>('emotion');
const paramsOutput = getElement<HTMLElement>('params');
const statusOutput = getElement<HTMLElement>('status');
const llmSummaryOutput = getElement<HTMLElement>('llm-summary');
const assistantReplyOutput = getElement<HTMLElement>('assistant-reply');
const streamSignalOutput = getElement<HTMLElement>('stream-signal');

let engine: Live2DExpressionEngine;
let motionCapability: Live2DMotionCapability | null = null;
let app: PixiApplication;
let model: PixiLive2DModel;
let stopPlayback: (() => void) | null = null;
let realtimeDirector: Live2DRealtimeMotionDirector | null = null;
let realtimeConfigKey = '';
let playbackSerial = 0;
let chatHistory: ConversationMessage[] = [];
let nextTickerFrameId = 1;
const tickerFrames = new Map<number, () => void>();

void boot();

async function boot(): Promise<void> {
  setStatus('Loading runtime');
  try {
    await loadPixiRuntime();
    app = createPixiApp();
    model = await loadModel();
    app.stage.addChild(model);
    fitModel();
    window.addEventListener('resize', fitModel);

    engine = await Live2DExpressionEngine.fromUrls(RESOURCE_URLS, {
      analyzer: {
        analyze: async (text) => {
          const result = await analyzeWithLlm(parseMessagesFromText(text), text);
          return softenFinalIntent(result.intent || { emotion: 'neutral' });
        },
      },
    });
    motionCapability = engine.getMotionCapability();
    modelName.textContent = engine.profile.characterName || 'Live2D model';
    capabilityOutput.textContent = formatCapability(motionCapability);
    bindControls();
    renderChatLog();
    setStatus('Ready');
    setDemoStatus({ ready: true, runtime: selectedRuntime(), emotion: 'neutral', keyframes: 0, parameterCount: 0, error: '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    setStatus(message);
    setDemoStatus({ ready: false, runtime: selectedRuntime(), emotion: '', keyframes: 0, parameterCount: 0, error: message });
  }
}

function bindControls(): void {
  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitChatMessage();
  });
  chatInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void submitChatMessage();
  });
  getElement<HTMLButtonElement>('send-message').addEventListener('click', (event) => {
    event.preventDefault();
    void submitChatMessage();
  });
  getElement<HTMLButtonElement>('clear-chat').addEventListener('click', clearConversation);
  getElement<HTMLButtonElement>('play-shy').addEventListener('click', () => playEmotion('shy'));
  getElement<HTMLButtonElement>('play-happy').addEventListener('click', () => playEmotion('happy'));
  getElement<HTMLButtonElement>('play-proud').addEventListener('click', () => playLayeredEmotion({ emotion: 'happy', tone: 'proud', mouth: 'smile' }));
  getElement<HTMLButtonElement>('play-excited').addEventListener('click', () => playLayeredEmotion({ emotion: 'happy', tone: 'excited', eyes: 'wide', mouth: 'smile' }));
  getElement<HTMLButtonElement>('play-grateful').addEventListener('click', () => playLayeredEmotion({ emotion: 'happy', tone: 'grateful', eyes: 'soft', mouth: 'smile' }));
  getElement<HTMLButtonElement>('play-playful').addEventListener('click', () => playLayeredEmotion({ emotion: 'teasing', tone: 'playful', mouth: 'smile' }));
  getElement<HTMLButtonElement>('play-amused').addEventListener('click', () => playLayeredEmotion({ emotion: 'teasing', tone: 'amused', eyes: 'soft', mouth: 'smile' }));
  getElement<HTMLButtonElement>('play-skeptical').addEventListener('click', () => playLayeredEmotion({ emotion: 'confused', tone: 'skeptical', brows: 'worried', mouth: 'pout' }));
  getElement<HTMLButtonElement>('play-reassuring').addEventListener('click', () => playLayeredEmotion({ emotion: 'panic', tone: 'reassuring', brows: 'worried' }));
  getElement<HTMLButtonElement>('play-focused').addEventListener('click', () => playLayeredEmotion({ emotion: 'angry', tone: 'focused', brows: 'angry', mouth: 'pressed' }));
  getElement<HTMLButtonElement>('play-frustrated').addEventListener('click', () => playLayeredEmotion({ emotion: 'angry', tone: 'frustrated', brows: 'angry', mouth: 'pressed' }));
  getElement<HTMLButtonElement>('play-startled').addEventListener('click', () => playLayeredEmotion({ emotion: 'surprised', tone: 'startled', eyes: 'wide', mouth: 'open' }));
  getElement<HTMLButtonElement>('play-nervous').addEventListener('click', () => playLayeredEmotion({ emotion: 'panic', tone: 'nervous', eyes: 'wide', mouth: 'open' }));
}

async function submitChatMessage(): Promise<void> {
  const content = chatInput.value.trim();
  if (!content) return;
  const messages = [...chatHistory, { role: 'user' as const, content }];
  chatHistory = messages;
  chatInput.value = '';
  renderChatLog();
  await runAssistantTurn(messages);
}

async function runAssistantTurn(messages: ConversationMessage[]): Promise<void> {
  const runId = ++playbackSerial;
  setBusy(true);
  setStatus('Starting stream');
  assistantReplyOutput.textContent = '';
  streamSignalOutput.textContent = 'Starting';
  llmSummaryOutput.textContent = 'Realtime director is waiting for assistant tokens.';

  const director = startRealtimeMotion(messages);
  let assistantText = '';
  let streamCompleted = false;
  const assistantIndex = chatHistory.length;
  chatHistory = [...chatHistory, { role: 'assistant', content: '' }];
  renderChatLog();

  try {
    for await (const event of streamAssistantReply(chatMessagesForLlm(messages))) {
      if (runId !== playbackSerial) return;
      if (event.type === 'delta') {
        assistantText += event.delta;
        chatHistory[assistantIndex] = { role: 'assistant', content: assistantText };
        assistantReplyOutput.textContent = assistantText;
        renderChatLog();
        const meta = director.pushAssistantDelta(event.delta);
        if (meta) updateRealtimeMeta(meta);
      }
      if (event.type === 'error') throw new Error(event.error);
    }

    if (!assistantText.trim()) throw new Error('LLM stream returned no assistant text');
    streamCompleted = true;
    director.finishAssistantText();
    setBusy(false);
    setStatus('Settling');
    llmSummaryOutput.textContent = director.lastMeta?.semanticPending
      ? 'Semantic calibration is running in the background.'
      : 'Stream completed.';
    window.setTimeout(() => {
      if (runId === playbackSerial) setStatus('Ready');
    }, selectedDurationMs() + 80);
  } catch (error) {
    if (runId !== playbackSerial) return;
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    if (realtimeDirector === director) director.stop();
    chatHistory[assistantIndex] = { role: 'assistant', content: `Error: ${message}` };
    renderChatLog();
    setStatus(message);
    llmSummaryOutput.textContent = message;
    setDemoStatus({
      ready: true,
      runtime: selectedRuntime(),
      emotion: emotionOutput.textContent || '',
      keyframes: 0,
      parameterCount: 0,
      llmSummary: message,
      error: message,
    });
  } finally {
    if (!streamCompleted && runId === playbackSerial) setBusy(false);
  }
}

function startRealtimeMotion(messages: ConversationMessage[]): Live2DRealtimeMotionDirector {
  stopPlayback?.();
  stopPlayback = null;

  const configKey = selectedRealtimeConfigKey();
  if (!realtimeDirector || realtimeConfigKey !== configKey) {
    stopRealtimeDirector();
    realtimeDirector = createRealtimeDirector();
    realtimeConfigKey = configKey;
  }

  const motionMessages = motionContext(messages);
  realtimeDirector.startTurn({ promptText: formatMessages(motionMessages) });
  return realtimeDirector;
}

function createRealtimeDirector(): Live2DRealtimeMotionDirector {
  let lastUiAt = 0;
  return createLive2DRealtimeMotionDirector({
    engine,
    model,
    runtime: selectedRuntime(),
    weight: selectedStreamWeight(),
    smoothingMs: selectedSmoothingMs(),
    stability: selectedStability(),
    expressiveness: selectedExpressiveness(),
    transitionMs: Math.round(clamp(selectedDurationMs() * 0.42, 360, 760)),
    semanticAnalyzer: createDemoSemanticAnalyzer(),
    semanticIntervalMs: 750,
    requestFrame: requestPixiFrame,
    cancelFrame: cancelPixiFrame,
    onFrame: (params, meta) => {
      const now = performance.now();
      if (now - lastUiAt < 120 && meta.source !== 'semantic' && meta.phase !== 'thinking') return;
      lastUiAt = now;
      updateRealtimeFrameStatus(params, meta);
    },
  });
}

function createDemoSemanticAnalyzer(): EmotionAnalyzer & EmotionStreamAnalyzer {
  return {
    async analyze(text) {
      const data = await analyzeWithLlm([], text);
      if (!data.intent) throw new Error('LLM analyzer returned no emotion intent');
      return softenRealtimeSemanticIntent(data.intent);
    },
    async *stream(text) {
      const messages = parseMessagesFromText(text);
      let emitted = false;
      for await (const event of streamEmotionIntents(chatMessagesForLlm(messages))) {
        if (event.type === 'intent') {
          emitted = true;
          yield { intent: softenStreamIntent(event.intent), summary: event.summary || event.intent.summary || '' };
        }
        if (event.type === 'error') throw new Error(event.error);
      }
      if (!emitted) {
        const data = await analyzeWithLlm(messages, text);
        if (data.intent) yield { intent: softenRealtimeSemanticIntent(data.intent), summary: data.summary || '' };
      }
    },
  };
}

function stopRealtimeDirector(): void {
  realtimeDirector?.stop();
  realtimeDirector = null;
  realtimeConfigKey = '';
  tickerFrames.forEach((callback) => app?.ticker?.remove(callback));
  tickerFrames.clear();
}

function clearConversation(): void {
  playbackSerial += 1;
  stopRealtimeDirector();
  stopPlayback?.();
  stopPlayback = null;
  chatHistory = [];
  chatInput.value = '';
  renderChatLog();
  assistantReplyOutput.textContent = 'Waiting for a message.';
  streamSignalOutput.textContent = 'Idle';
  llmSummaryOutput.textContent = 'Waiting for a message.';
  setBusy(false);
  setStatus('Ready');
  setDemoStatus({ ready: true, runtime: selectedRuntime(), emotion: emotionOutput.textContent || 'neutral', keyframes: 0, parameterCount: Number(paramsOutput.textContent || 0), error: '' });
}

function renderChatLog(): void {
  chatLog.replaceChildren();
  if (!chatHistory.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = '输入任意一句话开始真实对话。Live2D 会在回复流式输出时同步反应。';
    chatLog.append(empty);
    return;
  }

  for (const message of chatHistory) {
    const row = document.createElement('article');
    row.className = `chat-message ${message.role}`;
    const role = document.createElement('span');
    role.className = 'role';
    role.textContent = message.role === 'user' ? 'You' : 'Yachiyo';
    const content = document.createElement('p');
    content.textContent = message.content || '...';
    row.append(role, content);
    chatLog.append(row);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateRealtimeFrameStatus(params: Record<string, number>, meta: RealtimeMotionFrameMeta): void {
  const parameterCount = Object.keys(params).length;
  emotionOutput.textContent = meta.emotion;
  paramsOutput.textContent = String(parameterCount);
  updateRealtimeMeta(meta, parameterCount);
}

function updateRealtimeMeta(meta: RealtimeMotionFrameMeta, parameterCount = Number(paramsOutput.textContent || 0)): void {
  const summary = formatRealtimeSummary(meta);
  streamSignalOutput.textContent = formatRealtimeSignal(meta);
  llmSummaryOutput.textContent = summary;
  setStatus(formatRealtimeStatus(meta));
  setDemoStatus({
    ready: true,
    runtime: selectedRuntime(),
    emotion: meta.emotion,
    keyframes: 0,
    parameterCount,
    llmSummary: summary,
    error: '',
  });
}

function formatRealtimeSignal(meta: RealtimeMotionFrameMeta): string {
  const confidence = Math.round(meta.confidence * 100);
  const tone = meta.tone ? `/${meta.tone}` : '';
  const preset = meta.presetId ? ` · preset ${meta.presetId}` : '';
  const layerText = meta.layers
    ? ` · layers face ${formatLayer(meta.layers.face)} speech ${formatLayer(meta.layers.speech)} accent ${formatLayer(meta.layers.accent)}`
    : '';
  const local = meta.localEmotion ? ` · local ${meta.localEmotion}${meta.localPresetId ? `/${meta.localPresetId}` : ''}` : '';
  const semantic = meta.semanticEmotion
    ? ` · semantic ${meta.semanticEmotion}${meta.semanticPresetId ? `/${meta.semanticPresetId}` : ''}`
    : meta.semanticPending
      ? ' · semantic pending'
      : '';
  return `${meta.phase} · ${meta.source} · ${meta.emotion}${tone}${preset} · conf ${confidence}%${layerText}${local}${semantic}`;
}

function formatLayer(value: number): string {
  return value.toFixed(2);
}

function formatRealtimeSummary(meta: RealtimeMotionFrameMeta): string {
  if (meta.semanticPending) return 'Realtime local motion is active; semantic calibration is pending.';
  if (meta.semanticEmotion && meta.semanticEmotion === meta.emotion) {
    return `Streamed semantic emotion blended into ${meta.emotion}.`;
  }
  if (meta.semanticEmotion) return `Semantic ${meta.semanticEmotion} observed; holding ${meta.emotion}.`;
  if (meta.localEmotion && meta.localEmotion !== 'neutral') return `Local streaming signal is driving ${meta.localEmotion}.`;
  return 'Base motion is active.';
}

function formatRealtimeStatus(meta: RealtimeMotionFrameMeta): string {
  if (meta.semanticPending) return 'Calibrating';
  if (meta.phase === 'thinking') return 'LLM thinking';
  if (meta.phase === 'streaming' || meta.phase === 'reacting') return 'LLM streaming';
  if (meta.phase === 'settling') return 'Ready';
  return 'Calibrating';
}

function chatMessagesForLlm(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.slice(-12);
}

function motionContext(messages: ConversationMessage[]): ConversationMessage[] {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  return latestUserMessage ? [latestUserMessage] : messages.slice(-1);
}

function selectedRealtimeConfigKey(): string {
  return [
    selectedRuntime(),
    selectedStreamWeight(),
    selectedSmoothingMs(),
    selectedStability(),
    selectedExpressiveness(),
    selectedDurationMs(),
  ].join(':');
}

function playEmotion(emotion: 'happy' | 'shy'): void {
  playLayeredEmotion({ emotion });
}

function playLayeredEmotion(intent: EmotionIntent): void {
  playbackSerial += 1;
  stopRealtimeDirector();
  setBusy(false);
  const toneDuration = intent.tone === 'reassuring' ? selectedDurationMs() + 300 : selectedDurationMs();
  playTimeline(engine.generateNaturalTimelineFromIntent({
    ...intent,
    durationMs: selectedDurationMs(),
    intensity: selectedIntensity(),
  }, {
    durationMs: toneDuration,
    frameIntervalMs: 120,
    liveliness: 0.72,
    stability: selectedStability(),
    expressiveness: selectedExpressiveness(),
  }));
}

function playTimeline(timeline: TimelineExpressionResult, llmSummary = ''): void {
  stopRealtimeDirector();
  stopPlayback?.();
  const runtime = selectedRuntime();
  stopPlayback = playTimelineOnLive2DModel(model, timeline, { runtime, weight: 0.92 }).stop;
  updateTimelineStatus(timeline, llmSummary);
}

function updateTimelineStatus(timeline: TimelineExpressionResult, llmSummary = ''): void {
  const parameterCount = countTimelineParameters(timeline);
  emotionOutput.textContent = timeline.emotion;
  paramsOutput.textContent = String(parameterCount);
  if (llmSummary) llmSummaryOutput.textContent = llmSummary;
  setStatus('Playing');
  setDemoStatus({
    ready: true,
    runtime: selectedRuntime(),
    emotion: timeline.emotion,
    keyframes: timeline.keyframes.length,
    parameterCount,
    llmSummary,
    error: '',
  });
  window.setTimeout(() => {
    setStatus('Ready');
  }, timeline.durationMs + 80);
}

function softenFinalIntent(intent: EmotionIntent & { summary?: string } = { emotion: 'neutral' }): EmotionIntent & { summary?: string } {
  return {
    ...intent,
    intensity: clamp((intent.intensity ?? selectedIntensity()) * 1.16, 0.42, 1),
    durationMs: selectedDurationMs(),
  };
}

function softenRealtimeSemanticIntent(intent: EmotionIntent & { summary?: string } = { emotion: 'neutral' }): EmotionIntent & { summary?: string } {
  const baseIntensity = intent.intensity ?? selectedIntensity();
  const highPriority = intent.emotion === 'panic' || intent.emotion === 'angry';
  const expressiveBoost = selectedExpressiveness() >= 1.25 ? 0.12 : 0;
  return {
    ...intent,
    intensity: highPriority
      ? clamp(baseIntensity * 1.08, 0.5, intent.emotion === 'panic' ? 0.9 + expressiveBoost : 0.86 + expressiveBoost)
      : clamp(baseIntensity * 1.18, 0.46, 1),
    durationMs: Math.round(clamp(intent.durationMs ?? selectedDurationMs(), 600, 1800)),
  };
}

async function analyzeWithLlm(
  messages: ConversationMessage[] = chatHistory,
  text = formatMessages(chatHistory),
): Promise<AnalyzeResponse> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, text }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json() as AnalyzeResponse;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `LLM request failed: HTTP ${response.status}`);
  }
  return data;
}

async function* streamAssistantReply(messages: ConversationMessage[]): AsyncGenerator<ChatStreamEvent> {
  const abortController = new AbortController();
  const timeout = window.setTimeout(() => abortController.abort(), 120_000);
  try {
    const response = await fetch('/api/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: abortController.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(await readErrorResponse(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = consumeDemoSseEvents<ChatStreamEvent>(buffer);
        buffer = parsed.remaining;
        for (const event of parsed.events) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

async function streamEmotionPlan(
  runId: number,
  director: Live2DRealtimeMotionDirector,
  messages: ConversationMessage[],
): Promise<void> {
  try {
    for await (const event of streamEmotionIntents(chatMessagesForLlm(messages))) {
      if (runId !== playbackSerial) return;
      if (event.type === 'intent') {
        const intent = softenStreamIntent(event.intent);
        const meta = director.pushSemanticIntent(intent);
        updateRealtimeMeta(meta);
      }
      if (event.type === 'error') throw new Error(event.error);
    }
  } catch (error) {
    if (runId !== playbackSerial) return;
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    llmSummaryOutput.textContent = `Emotion stream failed: ${message}`;
  }
}

async function* streamEmotionIntents(messages: ConversationMessage[]): AsyncGenerator<EmotionStreamEvent> {
  const abortController = new AbortController();
  const timeout = window.setTimeout(() => abortController.abort(), 90_000);
  try {
    const response = await fetch('/api/emotion-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: abortController.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(await readErrorResponse(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = consumeDemoSseEvents<EmotionStreamEvent>(buffer);
        buffer = parsed.remaining;
        for (const event of parsed.events) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function consumeDemoSseEvents<T>(buffer: string): { remaining: string; events: T[] } {
  const events: T[] = [];
  let cursor = 0;
  while (true) {
    const next = buffer.indexOf('\n', cursor);
    if (next === -1) break;
    const line = buffer.slice(cursor, next).trim();
    cursor = next + 1;
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const event = JSON.parse(payload) as T;
      events.push(event);
    } catch {}
  }
  return { remaining: buffer.slice(cursor), events };
}

async function readErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || `LLM request failed: HTTP ${response.status}`;
  } catch {
    const text = await response.text().catch(() => '');
    return text || `LLM request failed: HTTP ${response.status}`;
  }
}

function formatMessages(messages: ConversationMessage[]): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Yachiyo'}: ${message.content}`)
    .join('\n');
}

function parseMessagesFromText(value: string): ConversationMessage[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(user|assistant|yachiyo)\s*[:：]\s*(.+)$/i);
      if (!match) return { role: 'user' as const, content: line };
      return {
        role: match[1].toLowerCase() === 'user' ? 'user' as const : 'assistant' as const,
        content: match[2],
      };
    });
}

function softenStreamIntent(intent: EmotionIntent & { summary?: string }): EmotionIntent & { summary?: string } {
  return {
    ...intent,
    intensity: clamp((intent.intensity ?? selectedIntensity()) * 1.28, 0.52, 1),
    durationMs: Math.round(clamp(intent.durationMs ?? selectedDurationMs(), 500, 1800)),
  };
}

function requestPixiFrame(callback: (timestamp: number) => void): number {
  if (!app?.ticker) return window.requestAnimationFrame(callback);
  const id = nextTickerFrameId++;
  const wrapped = () => {
    app.ticker?.remove(wrapped);
    tickerFrames.delete(id);
    callback(performance.now());
  };
  tickerFrames.set(id, wrapped);
  app.ticker.add(wrapped);
  return id;
}

function cancelPixiFrame(handle: number): void {
  const callback = tickerFrames.get(handle);
  if (callback) app?.ticker?.remove(callback);
  tickerFrames.delete(handle);
}

function setBusy(value: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = value;
  });
  chatInput.disabled = value;
}

async function loadPixiRuntime(): Promise<void> {
  const globalWindow = window as DemoWindow;
  globalWindow.process = globalWindow.process || {};
  globalWindow.process.env = globalWindow.process.env || {};
  globalWindow.process.env.NODE_ENV = globalWindow.process.env.NODE_ENV || 'production';
  for (const script of RUNTIME_SCRIPTS) await loadScript(script);
  if (!globalWindow.PIXI?.Application || !globalWindow.PIXI?.live2d?.Live2DModel || !globalWindow.Live2DCubismCore) {
    throw new Error('Live2D runtime failed to initialize');
  }
  try {
    if (globalWindow.PIXI.ENV?.WEBGL !== undefined) globalWindow.PIXI.settings.PREFER_ENV = globalWindow.PIXI.ENV.WEBGL;
  } catch {}
}

function createPixiApp(): PixiApplication {
  const globalWindow = window as DemoWindow;
  return new globalWindow.PIXI.Application({
    view: canvas,
    autoStart: true,
    transparent: true,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resizeTo: stageShell || window,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
}

async function loadModel(): Promise<PixiLive2DModel> {
  const globalWindow = window as DemoWindow;
  return globalWindow.PIXI.live2d.Live2DModel.from(`${MODEL_ROOT}${MODEL3}`, {
    autoFocus: false,
    autoHitTest: false,
  });
}

function fitModel(): void {
  if (!stageShell || !model || !app) return;
  const width = Math.max(stageShell.clientWidth, 1);
  const height = Math.max(stageShell.clientHeight, 1);
  app.renderer.resize(width, height);
  const bounds = typeof model.getLocalBounds === 'function' ? model.getLocalBounds() : { width: 0, height: 0 };
  if (!bounds.width || !bounds.height) return;
  const scale = Math.min(width / bounds.width, height / bounds.height) * 0.88;
  model.anchor?.set(0.5, 1);
  model.scale?.set(scale);
  model.x = width / 2;
  model.y = height * 0.98;
}

function selectedRuntime(): Live2DRuntimeKind {
  return runtimeInput.value === 'auto' ? 'auto' : 'pixi-live2d-display';
}

function selectedIntensity(): number {
  return Math.max(0, Math.min(1, Number(intensityInput.value || 0.75)));
}

function selectedDurationMs(): number {
  return Math.max(400, Math.min(4000, Number(durationInput.value || 1400)));
}

function selectedStreamWeight(): number {
  return clamp(Number(streamWeightInput.value || 0.95), 0.2, 1);
}

function selectedSmoothingMs(): number {
  return Math.round(clamp(Number(smoothingInput.value || 180), 80, 900));
}

function selectedStability(): number {
  return clamp(Number(stabilityInput.value || 0.55), 0, 1);
}

function selectedExpressiveness(): number {
  return clamp(Number(expressivenessInput.value || 2.05), 0.6, 2.6);
}

function countTimelineParameters(timeline: TimelineExpressionResult): number {
  const parameterIds = new Set<string>();
  for (const keyframe of timeline.keyframes) {
    Object.keys(keyframe.params).forEach((id) => parameterIds.add(id));
  }
  return parameterIds.size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function setStatus(value: string): void {
  statusOutput.textContent = value;
}

function setDemoStatus(status: DemoStatus): void {
  document.documentElement.dataset.live2dDemoStatus = JSON.stringify({
    capabilityScore: motionCapability?.score,
    capabilityFeatures: motionCapability?.availableFeatures,
    ...status,
  });
}

function formatCapability(capability: Live2DMotionCapability): string {
  const score = Math.round(capability.score * 100);
  const features = capability.availableFeatures.slice(0, 6).join(', ');
  return `${score}% · ${features}`;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
