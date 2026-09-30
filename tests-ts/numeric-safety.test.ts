import { beforeAll, describe, expect, it } from 'vitest';
import { Live2DExpressionEngine } from '../src-ts/index.js';
import { clampParams } from '../src-ts/mapper.js';

let engine: Live2DExpressionEngine;
beforeAll(async () => { engine = await Live2DExpressionEngine.fromNodeDirectory('yachiyo'); });
describe('finite expression boundaries', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    it(`rejects non-finite intensity ${value}`, () => {
      expect(() => engine.generateByEmotion('happy', { intensity: value })).toThrow(/finite/);
    });
    it(`rejects non-finite timeline duration ${value}`, () => {
      expect(() => engine.generateTimelineByEmotion('happy', { durationMs: value })).toThrow(/finite/);
    });
    it(`does not emit non-finite parameters ${value}`, () => {
      const result = clampParams({ ParamAngleX: value, ParamAngleY: 0 }, engine.profile);
      expect(result.params).toEqual({ ParamAngleY: 0 });
      expect(result.warnings).toEqual(['removed non-finite parameter: ParamAngleX']);
    });
  }
  it('rejects malformed ranges without sending values to the model', () => {
    for (const [min, max] of [[NaN, 1], [0, Infinity], [1, -1]]) {
      const profile = structuredClone(engine.profile);
      profile.parameters.ParamAngleX.range = {id: 'ParamAngleX', min, max, source: 'test'};
      const result = clampParams({ParamAngleX: 0}, profile);
      expect(result.params).toEqual({});
      expect(result.warnings).toEqual(['removed parameter with invalid range: ParamAngleX']);
    }
  });
  it('retains clamping of finite out-of-range inputs', () => {
    const result = engine.generateByEmotion('happy', {intensity: 2, durationMs: -10});
    expect(result.intensity).toBe(1);
    expect(result.durationMs).toBe(1);
    expect(Object.values(result.params).every(Number.isFinite)).toBe(true);
  });
});

describe('explicit expression overrides and Chinese intents', () => {
  for (const emotion of ['crying', 'panic', 'happy'] as const) {
    it(`respects the explicit none override for ${emotion}`, () => {
      const result = engine.generateByEmotion(emotion, {
        intensity: 1, eyes: 'closed_smile', specialExpression: 'none',
      });
      for (const id of ['ParamExpression_1', 'ParamExpression_2', 'ParamExpression_3', 'ParamExpression_4']) {
        expect(result.params[id]).toBe(0);
      }
    });
  }
  it('still derives tears when the override is omitted', () => {
    expect(engine.generateByEmotion('crying', { intensity: 1 }).params.ParamExpression_1).toBe(1);
  });
  it('distinguishes confusion from sleepiness', async () => {
    expect((await engine.generateFromText('我很困惑')).emotion).toBe('confused');
    expect((await engine.generateFromText('我很困，想睡觉')).emotion).toBe('sleepy');
  });
});
