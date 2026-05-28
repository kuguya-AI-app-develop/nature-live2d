import './styles.css';

import {
  type EmotionIntent,
  Live2DExpressionEngine,
  Live2DExpressionOrchestrator,
  Live2DStreamingExpressionController,
  playTimelineOnLive2DModel,
  type EmotionSignal,
  type Live2DRuntimeKind,
  type Live2DParameterTarget,
  type TimelineExpressionResult,
} from '../../src-ts/index.ts';

type PixiApplication = {
  renderer: { resize: (width: number, height: number) => void };
  stage: { addChild: (child: unknown) => void };
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
  llmSummary?: string;
  error: string;
};

type DialogueCase = {
  id: string;
  label: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
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
const summaryInput = getElement<HTMLTextAreaElement>('summary');
const caseList = getElement<HTMLElement>('case-list');
const intensityInput = getElement<HTMLInputElement>('intensity');
const durationInput = getElement<HTMLInputElement>('duration');
const streamWeightInput = getElement<HTMLInputElement>('stream-weight');
const smoothingInput = getElement<HTMLInputElement>('smoothing');
const promptBiasInput = getElement<HTMLInputElement>('prompt-bias');
const finalBlendInput = getElement<HTMLInputElement>('final-blend');
const stabilityInput = getElement<HTMLInputElement>('stability');
const modelName = getElement<HTMLElement>('model-name');
const emotionOutput = getElement<HTMLElement>('emotion');
const paramsOutput = getElement<HTMLElement>('params');
const statusOutput = getElement<HTMLElement>('status');
const llmSummaryOutput = getElement<HTMLElement>('llm-summary');
const assistantReplyOutput = getElement<HTMLElement>('assistant-reply');
const streamSignalOutput = getElement<HTMLElement>('stream-signal');

const CASES: DialogueCase[] = [
  {
    id: 'shy-praise',
    label: 'Praise',
    messages: [
      { role: 'user', content: '刚才那段分析帮了大忙，你真的很可靠。' },
    ],
  },
  {
    id: 'sad-recovery',
    label: 'Recovery',
    messages: [
      { role: 'user', content: '计划又失败了，今天感觉白忙了一整天。' },
    ],
  },
  {
    id: 'surprise-success',
    label: 'Surprise',
    messages: [
      { role: 'user', content: '居然一次跑通了，连我都没想到。' },
    ],
  },
  {
    id: 'teasing',
    label: 'Teasing',
    messages: [
      { role: 'user', content: '你刚才是不是故意逗我？' },
    ],
  },
  {
    id: 'panic',
    label: 'Panic',
    messages: [
      { role: 'user', content: '生产环境突然进不去了，用户都在报错。' },
    ],
  },
];

let engine: Live2DExpressionEngine;
let app: PixiApplication;
let model: PixiLive2DModel;
let stopPlayback: (() => void) | null = null;
let streamController: Live2DStreamingExpressionController | null = null;
let activeCase = CASES[0];
let expressionOrchestrator: Live2DExpressionOrchestrator | null = null;
let playbackSerial = 0;
let sustainTimer = 0;

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
          const result = await analyzeWithLlm(parseTextareaMessages(text), text);
          return softenFinalIntent(result.intent || { emotion: 'neutral' });
        },
      },
    });
    modelName.textContent = engine.profile.characterName || 'Live2D model';
    bindControls();
    selectCase(activeCase.id);
    setStatus('Ready');
    setDemoStatus({ ready: true, runtime: selectedRuntime(), emotion: 'neutral', keyframes: 0, parameterCount: 0, error: '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    setStatus(message);
    setDemoStatus({ ready: false, runtime: selectedRuntime(), emotion: '', keyframes: 0, parameterCount: 0, error: message });
  }
}

function bindControls(): void {
  caseList.replaceChildren(...CASES.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'case-button';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      selectCase(item.id);
      void playText();
    });
    return button;
  }));
  getElement<HTMLButtonElement>('play-text').addEventListener('click', () => void playText());
  getElement<HTMLButtonElement>('play-natural').addEventListener('click', () => void playNaturalMotion());
  getElement<HTMLButtonElement>('play-shy').addEventListener('click', () => playEmotion('shy'));
  getElement<HTMLButtonElement>('play-happy').addEventListener('click', () => playEmotion('happy'));
  runtimeInput.addEventListener('change', () => void playText());
}

async function playNaturalMotion(): Promise<void> {
  const runId = ++playbackSerial;
  setBusy(true);
  stopSustainLoop();
  streamController?.stop();
  stopPlayback?.();
  expressionOrchestrator?.reset();
  assistantReplyOutput.textContent = summaryInput.value;
  streamSignalOutput.textContent = 'Natural timeline';
  llmSummaryOutput.textContent = 'Generating natural motion from text.';
  setStatus('Analyzing natural motion');

  try {
    const timeline = await engine.generateNaturalTimelineFromText(summaryInput.value, {
      durationMs: selectedDurationMs(),
      frameIntervalMs: 120,
      liveliness: selectedIntensity(),
      stability: selectedStability(),
    });
    if (runId !== playbackSerial) return;
    streamSignalOutput.textContent = formatTimelinePhases(timeline);
    playTimeline(timeline, `natural · ${timeline.keyframes.length} keyframes`);
  } catch (error) {
    if (runId !== playbackSerial) return;
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
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
    if (runId === playbackSerial) setBusy(false);
  }
}

async function playText(): Promise<void> {
  const runId = ++playbackSerial;
  setBusy(true);
  setStatus('Starting stream');
  assistantReplyOutput.textContent = '';
  streamSignalOutput.textContent = 'Starting';
  llmSummaryOutput.textContent = 'Waiting for final calibration.';
  stopSustainLoop();
  stopPlayback?.();
  const controller = startStreamingPreview();
  const orchestrator = expressionOrchestrator;
  if (!orchestrator) throw new Error('Expression orchestrator failed to initialize');
  const messages = parseTextareaMessages(summaryInput.value);
  let assistantText = '';
  let lastPreviewAt = 0;
  const pushPreview = (force = false) => {
    const now = performance.now();
    const shouldPush = force || now - lastPreviewAt >= 140 || /[，。！？!?]$/.test(assistantText.trim());
    if (!shouldPush) return;
    lastPreviewAt = now;
    updateStreamingPreview(controller, messages, assistantText, force);
  };

  let streamCompleted = false;
  try {
    pushPreview(true);
    for await (const event of streamAssistantReply(messages)) {
      if (runId !== playbackSerial) return;
      if (event.type === 'delta') {
        assistantText += event.delta;
        assistantReplyOutput.textContent = assistantText;
        pushPreview(false);
      }
      if (event.type === 'error') throw new Error(event.error);
    }

    if (!assistantText.trim()) throw new Error('LLM stream returned no assistant text');
    pushPreview(true);
    streamCompleted = true;
    setBusy(false);
    setStatus('Calibrating');
    llmSummaryOutput.textContent = 'Final calibration is running in the background.';
    void calibrateFinalIntent(runId, orchestrator, messages, assistantText);
  } catch (error) {
    if (runId !== playbackSerial) return;
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    stopSustainLoop();
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

async function calibrateFinalIntent(
  runId: number,
  orchestrator: Live2DExpressionOrchestrator,
  messages: DialogueCase['messages'],
  assistantText: string,
): Promise<void> {
  startSustainLoop(runId, orchestrator);
  try {
    const finalMessages: DialogueCase['messages'] = [...messages, { role: 'assistant', content: assistantText }];
    const result = await analyzeWithLlm(finalMessages, formatMessages(finalMessages));
    if (runId !== playbackSerial) return;
    stopSustainLoop();
    const intent = softenFinalIntent(result.intent || { emotion: 'neutral' });
    const { result: expression, signal } = orchestrator.pushFinalIntent(intent, { amount: selectedFinalBlend() });
    updateStreamingStatus(expression, finalCalibrationSummary(result, signal.intent));
    streamSignalOutput.textContent = formatPreviewSignal(signal);
    window.setTimeout(() => {
      if (runId === playbackSerial) setStatus('Ready');
    }, selectedDurationMs() + 80);
  } catch (error) {
    if (runId !== playbackSerial) return;
    stopSustainLoop();
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    llmSummaryOutput.textContent = `Final calibration failed: ${message}`;
    setStatus('Ready');
  }
}

function playEmotion(emotion: 'happy' | 'shy'): void {
  playbackSerial += 1;
  stopSustainLoop();
  setBusy(false);
  expressionOrchestrator?.reset();
  streamController?.stop();
  playTimeline(engine.generateTimelineByEmotion(emotion, {
    durationMs: selectedDurationMs(),
    intensity: selectedIntensity(),
  }));
}

function playTimeline(timeline: TimelineExpressionResult, llmSummary = ''): void {
  stopSustainLoop();
  streamController?.stop();
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

function formatTimelinePhases(timeline: TimelineExpressionResult): string {
  const phases = Array.from(new Set(timeline.keyframes.map((keyframe) => keyframe.phase).filter(Boolean)));
  return phases.length
    ? `${timeline.emotion} · ${timeline.keyframes.length} keyframes · ${phases.join(' > ')}`
    : `${timeline.emotion} · ${timeline.keyframes.length} keyframes`;
}

function startStreamingPreview(): Live2DStreamingExpressionController {
  stopSustainLoop();
  streamController?.stop();
  streamController = new Live2DStreamingExpressionController({
    engine,
    model,
    runtime: selectedRuntime(),
    weight: selectedStreamWeight(),
    smoothingMs: selectedSmoothingMs(),
    minUpdateMs: 110,
  });
  streamController.start();
  expressionOrchestrator = new Live2DExpressionOrchestrator({
    target: streamController,
    estimatorOptions: {
      baseIntensity: selectedIntensity(),
      promptBias: selectedPromptBias(),
      durationMs: selectedDurationMs(),
    },
    stabilizerOptions: {
      holdMs: 520,
      neutralHoldMs: 900,
    },
    finalBlend: selectedFinalBlend(),
  });
  return streamController;
}

function startSustainLoop(runId: number, orchestrator: Live2DExpressionOrchestrator): void {
  stopSustainLoop();
  const intervalMs = Math.round(clamp(selectedDurationMs() * 0.72, 650, 1600));
  const sustain = () => {
    if (runId !== playbackSerial) {
      stopSustainLoop();
      return;
    }
    const orchestration = orchestrator.pushSustain({
      durationMs: selectedDurationMs(),
      intensityAmplitude: 0.045,
      now: () => performance.now(),
    });
    if (!orchestration) return;
    const { result, signal } = orchestration;
    streamSignalOutput.textContent = formatPreviewSignal(signal);
    updateStreamingStatus(result, `sustain · ${result.emotion} · waiting for final calibration`);
    setStatus('Calibrating');
  };
  sustain();
  sustainTimer = window.setInterval(sustain, intervalMs);
}

function stopSustainLoop(): void {
  if (!sustainTimer) return;
  window.clearInterval(sustainTimer);
  sustainTimer = 0;
}

function updateStreamingPreview(
  controller: Live2DStreamingExpressionController,
  messages: DialogueCase['messages'],
  assistantText: string,
  force = false,
): void {
  const orchestration = expressionOrchestrator?.pushStreamText({
    promptText: formatMessages(messages),
    replyText: assistantText,
    timestampMs: performance.now(),
  });
  if (!orchestration) return;
  const { result, signal } = orchestration;
  streamSignalOutput.textContent = formatPreviewSignal(signal);
  updateStreamingStatus(
    result,
    assistantText
      ? `stream · ${result.emotion}${force ? ' · checkpoint' : ''}`
      : `prompt · ${result.emotion} · warmup`,
  );
  setStatus(assistantText ? 'LLM streaming' : 'LLM thinking');
}

function updateStreamingStatus(result: ReturnType<Live2DStreamingExpressionController['pushIntent']>, summary = ''): void {
  const timeline = engine.generateTimelineFromIntent(result.sourceIntent);
  const parameterCount = countTimelineParameters(timeline);
  emotionOutput.textContent = result.emotion;
  paramsOutput.textContent = String(parameterCount);
  if (summary) llmSummaryOutput.textContent = summary;
  setDemoStatus({
    ready: true,
    runtime: selectedRuntime(),
    emotion: result.emotion,
    keyframes: timeline.keyframes.length,
    parameterCount,
    llmSummary: summary,
    error: '',
  });
}

function formatPreviewSignal(signal: EmotionSignal): string {
  const confidence = Math.round(signal.confidence * 100);
  const held = signal.held ? ' · hold' : '';
  return `${signal.source} · ${signal.intent.emotion} · ${confidence}%${held}`;
}

function softenFinalIntent(intent: EmotionIntent & { summary?: string } = { emotion: 'neutral' }): EmotionIntent & { summary?: string } {
  return {
    ...intent,
    intensity: clamp((intent.intensity ?? selectedIntensity()) * 0.88, 0.22, 0.82),
    durationMs: selectedDurationMs(),
  };
}

function finalCalibrationSummary(result: AnalyzeResponse, intent: EmotionIntent & { summary?: string }): string {
  const summary = result.summary || intent.summary || 'Final LLM emotion intent applied.';
  if (result.intent?.emotion && result.intent.emotion !== intent.emotion) {
    return `${summary} Stream signal kept ${intent.emotion} instead of ${result.intent.emotion}.`;
  }
  return summary;
}

async function analyzeWithLlm(
  messages = parseTextareaMessages(summaryInput.value),
  text = summaryInput.value,
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

async function* streamAssistantReply(messages: DialogueCase['messages']): AsyncGenerator<ChatStreamEvent> {
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
        const parsed = consumeDemoSseEvents(buffer);
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

function consumeDemoSseEvents(buffer: string): { remaining: string; events: ChatStreamEvent[] } {
  const events: ChatStreamEvent[] = [];
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
      const event = JSON.parse(payload) as ChatStreamEvent;
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

function selectCase(id: string): void {
  activeCase = CASES.find((item) => item.id === id) || CASES[0];
  summaryInput.value = formatMessages(activeCase.messages);
  for (const button of Array.from(caseList.querySelectorAll<HTMLButtonElement>('button'))) {
    button.classList.toggle('active', button.textContent === activeCase.label);
  }
}

function formatMessages(messages: DialogueCase['messages']): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Yachiyo'}: ${message.content}`)
    .join('\n');
}

function parseTextareaMessages(value: string): DialogueCase['messages'] {
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

function setBusy(value: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = value;
  });
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
  return clamp(Number(streamWeightInput.value || 0.52), 0.2, 0.9);
}

function selectedSmoothingMs(): number {
  return Math.round(clamp(Number(smoothingInput.value || 420), 120, 900));
}

function selectedPromptBias(): number {
  return clamp(Number(promptBiasInput.value || 0.28), 0, 0.6);
}

function selectedFinalBlend(): number {
  return clamp(Number(finalBlendInput.value || 0.55), 0, 1);
}

function selectedStability(): number {
  return clamp(Number(stabilityInput.value || 0.82), 0, 1);
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
  document.documentElement.dataset.live2dDemoStatus = JSON.stringify(status);
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
