import type { IncomingMessage, ServerResponse } from 'node:http';

import { defineConfig, type Plugin } from 'vite';

import {
  OpenAICompatibleEmotionAnalyzer,
  resolveOpenAICompatibleProviderExtraBody,
} from './src-ts/openai-analyzer.ts';

type AnalyzeRequest = {
  messages?: Array<{ role?: string; content?: string }>;
  text?: string;
};

type ChatStreamRequest = {
  messages?: Array<{ role?: string; content?: string }>;
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const CHAT_SYSTEM_PROMPT = [
  '你是月見八千代，一个会通过 Live2D 面部表情表达情绪的中文助手。',
  '请用自然中文回复用户，1 到 3 句即可。',
  '情绪可以自然流露在措辞里，但不要输出 JSON、标签、舞台指令、括号动作、颜文字或参数名。',
  '根据上下文表现出害羞、惊讶、难过、慌张、调皮、开心等细微反应。',
].join('\n');

export default defineConfig({
  plugins: [llmAnalyzeApi()],
});

function llmAnalyzeApi(): Plugin {
  return {
    name: 'nature-live2d-llm-analyze-api',
    configureServer(server) {
      server.middlewares.use('/api/chat-stream', async (request, response, next) => {
        if (request.method === 'OPTIONS') {
          writeJson(response, 204, {});
          return;
        }
        if (request.method !== 'POST') {
          next();
          return;
        }

        try {
          const apiKey = process.env.LIVE2D_LLM_API_KEY || '';
          const baseUrl = process.env.LIVE2D_LLM_BASE_URL || 'https://api.openai.com/v1';
          const model = process.env.LIVE2D_LLM_MODEL || 'mimo-v2.5';
          if (!apiKey) throw new Error('LIVE2D_LLM_API_KEY is not set in the demo server environment');

          const body = JSON.parse(await readRequestBody(request)) as ChatStreamRequest;
          await streamChatCompletion({
            apiKey,
            baseUrl,
            model,
            messages: normalizeChatMessages(body.messages),
            request,
            response,
          });
        } catch (error) {
          if (response.headersSent) {
            writeSseEvent(response, {
              type: 'error',
              error: error instanceof Error ? error.message : String(error || 'unknown error'),
            });
            response.end();
            return;
          }
          writeJson(response, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error || 'unknown error'),
          });
        }
      });

      server.middlewares.use('/api/analyze', async (request, response, next) => {
        if (request.method === 'OPTIONS') {
          writeJson(response, 204, {});
          return;
        }
        if (request.method !== 'POST') {
          next();
          return;
        }

        try {
          const apiKey = process.env.LIVE2D_LLM_API_KEY || '';
          const baseUrl = process.env.LIVE2D_LLM_BASE_URL || 'https://api.openai.com/v1';
          const model = process.env.LIVE2D_LLM_MODEL || 'mimo-v2.5';
          if (!apiKey) throw new Error('LIVE2D_LLM_API_KEY is not set in the demo server environment');

          const body = JSON.parse(await readRequestBody(request)) as AnalyzeRequest;
          const text = formatAnalyzeText(body);
          const analyzer = new OpenAICompatibleEmotionAnalyzer({ baseUrl, apiKey, model });
          const intent = await analyzer.analyze(text);
          writeJson(response, 200, {
            ok: true,
            model,
            intent,
            summary: intent.summary || '',
          });
        } catch (error) {
          writeJson(response, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error || 'unknown error'),
          });
        }
      });

      server.middlewares.use('/api/emotion-stream', async (request, response, next) => {
        if (request.method === 'OPTIONS') {
          writeJson(response, 204, {});
          return;
        }
        if (request.method !== 'POST') {
          next();
          return;
        }

        try {
          const apiKey = process.env.LIVE2D_LLM_API_KEY || '';
          const baseUrl = process.env.LIVE2D_LLM_BASE_URL || 'https://api.openai.com/v1';
          const model = process.env.LIVE2D_LLM_MODEL || 'mimo-v2.5';
          if (!apiKey) throw new Error('LIVE2D_LLM_API_KEY is not set in the demo server environment');

          const body = JSON.parse(await readRequestBody(request)) as ChatStreamRequest;
          await streamEmotionIntents({
            apiKey,
            baseUrl,
            model,
            messages: normalizeChatMessages(body.messages),
            request,
            response,
          });
        } catch (error) {
          if (response.headersSent) {
            writeSseEvent(response, {
              type: 'error',
              error: error instanceof Error ? error.message : String(error || 'unknown error'),
            });
            response.end();
            return;
          }
          writeJson(response, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error || 'unknown error'),
          });
        }
      });
    },
  };
}

async function streamChatCompletion(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  if (!options.messages.length) throw new Error('At least one user message is required');

  const abortController = new AbortController();
  options.request.on('close', () => abortController.abort());

  const upstream = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.75,
      ...resolveOpenAICompatibleProviderExtraBody({ baseUrl: options.baseUrl, model: options.model }),
      stream: true,
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...options.messages,
      ],
    }),
    signal: abortController.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => '');
    throw new Error(`Chat stream failed: HTTP ${upstream.status}${message ? ` ${message.slice(0, 240)}` : ''}`);
  }

  writeSseHeaders(options.response);
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneSent = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeOpenAISseLines(buffer, (payload) => {
        if (payload === '[DONE]') {
          if (!doneSent) writeSseEvent(options.response, { type: 'done' });
          doneSent = true;
          return;
        }
        const event = parseOpenAIStreamPayload(payload);
        if (event.delta) writeSseEvent(options.response, { type: 'delta', delta: event.delta });
        if (event.finishReason) writeSseEvent(options.response, { type: 'finish', finishReason: event.finishReason });
      });
    }
  } finally {
    reader.releaseLock();
  }

  if (!doneSent) writeSseEvent(options.response, { type: 'done' });
  options.response.end();
}

async function streamEmotionIntents(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  if (!options.messages.length) throw new Error('At least one user message is required');

  const analyzer = new OpenAICompatibleEmotionAnalyzer({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.model,
    temperature: 0.15,
    maxTokens: 260,
  });

  writeSseHeaders(options.response);
  for await (const event of analyzer.stream([
    'Dialogue so far:',
    formatChatMessages(options.messages),
  ].join('\n'))) {
    writeSseEvent(options.response, {
      type: 'intent',
      intent: event.intent,
      summary: event.intent.summary || '',
    });
  }
  writeSseEvent(options.response, { type: 'done' });
  options.response.end();
}

function normalizeChatMessages(messages: ChatStreamRequest['messages']): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message): ChatMessage | null => {
      const content = String(message.content || '').trim();
      if (!content) return null;
      const role = normalizeChatRole(message.role);
      return { role, content };
    })
    .filter((message): message is ChatMessage => Boolean(message));
}

function normalizeChatRole(role: unknown): ChatMessage['role'] {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'assistant') return 'assistant';
  if (normalized === 'system') return 'system';
  return 'user';
}

function formatChatMessages(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
}

function consumeOpenAISseLines(buffer: string, onData: (payload: string) => void): string {
  let cursor = 0;
  while (true) {
    const next = buffer.indexOf('\n', cursor);
    if (next === -1) break;
    const line = buffer.slice(cursor, next).trim();
    cursor = next + 1;
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload) onData(payload);
  }
  return buffer.slice(cursor);
}

function parseOpenAIStreamPayload(payload: string): { delta: string; finishReason: string } {
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: unknown };
        finish_reason?: unknown;
      }>;
    };
    const choice = parsed.choices?.[0];
    return {
      delta: String(choice?.delta?.content ?? ''),
      finishReason: String(choice?.finish_reason ?? ''),
    };
  } catch {
    return { delta: '', finishReason: '' };
  }
}

function formatAnalyzeText(body: AnalyzeRequest): string {
  if (Array.isArray(body.messages) && body.messages.length) {
    return body.messages
      .map((message) => `${message.role || 'message'}: ${message.content || ''}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  return String(body.text || '').trim();
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64_000) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(data || '{}'));
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(statusCode === 204 ? undefined : JSON.stringify(payload));
}

function writeSseHeaders(response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();
}

function writeSseEvent(response: ServerResponse, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}
