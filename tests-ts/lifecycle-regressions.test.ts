import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Live2DExpressionEngine, Live2DStreamingExpressionController,
  playTimelineOnLive2DModel, applyParamsToLive2DModel, OpenAICompatibleEmotionAnalyzer } from '../src-ts/index.js';
import type { EmotionIntent, Live2DFrameCallback } from '../src-ts/index.js';

let engine: Live2DExpressionEngine;
beforeAll(async () => { engine = await Live2DExpressionEngine.fromNodeDirectory('yachiyo'); });
describe('async lifecycle ownership', () => {
  it('does not let old text analysis overwrite a newer explicit intent', async () => {
    let finish!: (intent: EmotionIntent) => void;
    const analyzer = {analyze: vi.fn(() => new Promise<EmotionIntent>(resolve => { finish = resolve; }))};
    const controller = new Live2DStreamingExpressionController({
      engine, analyzer, model: {setParameterValueById() {}},
      minUpdateMs: 0, requestFrame: () => 1, cancelFrame() {},
    });
    const pending = controller.pushText('old text', {force: true});
    await controller.pushText('queued old text', {force: true});
    controller.pushIntent({emotion: 'angry', intensity: 1});
    finish({emotion: 'happy', intensity: 1});
    await expect(pending).resolves.toBeNull();
    expect(controller.lastResult?.emotion).toBe('angry');
    expect(analyzer.analyze).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('does not invalidate pending valid analysis when an explicit intent is rejected', async () => {
    let finish!: (intent: EmotionIntent) => void;
    const controller = new Live2DStreamingExpressionController({
      engine, analyzer: {analyze: () => new Promise(resolve => { finish = resolve; })},
      model: {setParameterValueById() {}}, requestFrame: () => 1, cancelFrame() {},
    });
    const pending = controller.pushText('valid text', {force: true});
    expect(() => controller.pushIntent({emotion: 'happy', intensity: NaN})).toThrow(/finite/);
    finish({emotion: 'shy'});
    expect((await pending)?.emotion).toBe('shy');
    expect(controller.lastResult?.emotion).toBe('shy');
    controller.dispose();
  });

  it('detaches deferred model hooks when timeline playback is stopped', () => {
    const emitter = new EventEmitter();
    const setter = vi.fn();
    const model = {internalModel: Object.assign(emitter, {coreModel: {setParameterValueById: setter}})};
    let frame!: Live2DFrameCallback;
    const playback = playTimelineOnLive2DModel(model, engine.generateTimelineByEmotion('happy'), {
      applyTiming: 'before-model-update', requestFrame: callback => { frame = callback; return 1; },
      cancelFrame() {}, now: () => 0,
    });
    frame(0);
    expect(emitter.listenerCount('beforeModelUpdate')).toBe(1);
    playback.stop();
    playback.stop();
    expect(emitter.listenerCount('beforeModelUpdate')).toBe(0);
    emitter.emit('beforeModelUpdate');
    expect(setter).not.toHaveBeenCalled();
  });

  it('pauses deferred streaming writes and disposes controller hooks permanently', async () => {
    const emitter = new EventEmitter();
    const setter = vi.fn();
    const model = {internalModel: Object.assign(emitter, {coreModel: {setParameterValueById: setter}})};
    let frame!: Live2DFrameCallback;
    const controller = new Live2DStreamingExpressionController({
      engine, model, applyTiming: 'before-model-update',
      requestFrame: callback => { frame = callback; return 1; }, cancelFrame() {}, now: () => 0,
    });
    controller.pushEmotion('happy');
    frame(0);
    controller.stop();
    emitter.emit('beforeModelUpdate');
    expect(setter).not.toHaveBeenCalled();
    controller.start(); frame(0); emitter.emit('beforeModelUpdate');
    expect(setter).toHaveBeenCalled();
    controller.dispose(); controller.dispose();
    expect(emitter.listenerCount('beforeModelUpdate')).toBe(0);
    expect(() => controller.start()).toThrow(/disposed/);
    await expect(controller.pushText('new')).rejects.toThrow(/disposed/);
  });

  it('applies a deferred one-shot helper once and removes its listener', () => {
    const emitter = new EventEmitter();
    const setter = vi.fn();
    const model = {internalModel: Object.assign(emitter, {coreModel: {setParameterValueById: setter}})};
    applyParamsToLive2DModel(model, {ParamAngleX: 5}, {applyTiming: 'before-model-update'});
    expect(setter).not.toHaveBeenCalled();
    emitter.emit('beforeModelUpdate');
    expect(setter).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount('beforeModelUpdate')).toBe(0);
    emitter.emit('beforeModelUpdate');
    expect(setter).toHaveBeenCalledTimes(1);
  });

  it('retains coalesced analysis failures without an unhandled rejection and recovers', async () => {
    let finish!: (intent: EmotionIntent) => void;
    const failure = new Error('offline');
    const analyzer = {analyze: vi.fn()
      .mockImplementationOnce(() => new Promise<EmotionIntent>(resolve => { finish = resolve; }))
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({emotion: 'happy'})};
    const controller = new Live2DStreamingExpressionController({
      engine, analyzer, model: {setParameterValueById() {}},
      minUpdateMs: 0, requestFrame: () => 1, cancelFrame() {},
    });
    const pending = controller.pushText('first', {force: true});
    await expect(controller.pushText('queued', {force: true})).resolves.toBeNull();
    finish({emotion: 'neutral'});
    await pending;
    await vi.waitFor(() => expect(controller.lastError).toBe(failure));
    expect(controller.lastResult?.emotion).toBe('neutral');
    await controller.pushText('retry', {force: true});
    expect(controller.lastError).toBeNull();
    expect(controller.lastResult?.emotion).toBe('happy');
    controller.stop();
  });

  it('cancels the response body when the consumer stops an emotion stream early', async () => {
    const cancel = vi.fn();
    const payload = JSON.stringify({choices: [{delta: {content: '{"emotion":"happy","intensity":0.7}'}}]});
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`)); },
      cancel,
    });
    const analyzer = new OpenAICompatibleEmotionAnalyzer({
      baseUrl: 'https://example.test/v1', apiKey: 'test-only', model: 'test',
      fetcher: vi.fn(async () => new Response(body)),
    });
    let seen = 0;
    for await (const event of analyzer.stream('hello')) {
      expect(event.intent.emotion).toBe('happy'); seen += 1; break;
    }
    expect(seen).toBe(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });
});
