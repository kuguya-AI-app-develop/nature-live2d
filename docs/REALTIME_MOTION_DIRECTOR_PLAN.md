# Realtime Live2D Motion Director Plan

## Summary

Use a hybrid realtime pipeline: local inference reacts immediately while the assistant reply is streaming, and a slower LLM semantic analyzer calibrates the motion in the background. The Live2D model should never wait for the full answer or the final emotion JSON before moving.

The package should manage face and body motion as one continuous state machine. LLM output is treated as semantic guidance, not direct parameter planning.

## Goals

- Start expression and body motion as soon as a turn starts and assistant tokens begin streaming.
- Keep motion continuous while the LLM reply is still being generated.
- Use local signal estimation for low-latency reactions.
- Use asynchronous LLM calibration for semantic accuracy without visible snapping.
- Drive face, eyes, head, and body through one motion director with smoothing, speed limits, and stability controls.

## Architecture

### 1. Realtime Controller API

Add a public realtime controller:

```ts
const director = createLive2DRealtimeMotionDirector({
  engine,
  model,
  runtime: "pixi-live2d-display",
  semanticAnalyzer,
  stability: 0.62,
  smoothingMs: 220,
  expressiveness: 2.05,
});

director.startTurn({ promptText });
director.pushAssistantDelta(delta);
director.finishAssistantText();
director.pushSemanticIntent(intent);
director.stop();
```

The controller should also support apps that do not want the package to write to the model directly:

```ts
const director = createLive2DRealtimeMotionDirector({
  engine,
  onFrame: (params, meta) => {
    applyParamsToRuntime(params, meta);
  },
});
```

### 2. Layered Signal Model

Motion should be driven by semantic layers and runtime motion layers:

- **Base motion**: breathing, subtle body sway, gaze hold, and small head movement. It starts immediately at `startTurn`.
- **Local affect**: keyword, punctuation, and partial-reply cues. It updates during `pushAssistantDelta` and has low confidence by default.
- **Semantic calibration**: asynchronous or streamed LLM analyzer results. It corrects emotion, tone, and intensity over time without direct snapping.
- **Runtime frame layers**: core target expression, facial micro expression, speech mouth motion, attention/gaze motion, body pose, breath, transition accent, and expression-mask blink. These are composed every frame after model capability filtering.

Local affect is backed by an exported preset catalog. Host apps can inspect `getDefaultEmotionSignalPresets()`, override estimator rules, or call `resolveEmotionSignalPreset(intent)` to map streamed `emotion + tone` results back to the same preset ids used by local prediction.

### 3. State Machine

Use a continuous turn state machine:

- `thinking`: user prompt received, no assistant tokens yet.
- `streaming`: assistant tokens are arriving.
- `reacting`: local affect found a visible emotional cue.
- `calibrating`: semantic analyzer is pending or has returned a correction.
- `settling`: assistant stream ended and motion eases into a stable expression.

Each emitted frame includes metadata:

```ts
type RealtimeMotionFrameMeta = {
  phase: "thinking" | "streaming" | "reacting" | "calibrating" | "settling";
  source: "idle" | "local" | "semantic" | "sustain";
  emotion: EmotionName;
  tone?: EmotionToneName | null;
  presetId?: string | null;
  presetLabel?: string | null;
  confidence: number;
  timestampMs: number;
  localPresetId?: string | null;
  semanticPresetId?: string | null;
  layers: {
    face: number;
    speech: number;
    gaze: number;
    pose: number;
    breath: number;
    accent: number;
    mask: number;
  };
};
```

## Behavior Rules

### Local First

Local affect is allowed to move the model immediately, but with conservative intensity. It should be strong enough to prevent a static model, but weak enough that semantic corrections do not look like a contradiction.

### Semantic Calibration

The semantic analyzer should run in the background on `prompt + partial reply`:

- Trigger every `semanticIntervalMs`, default `700`.
- Trigger at sentence boundaries when useful.
- Coalesce pending analysis so only the latest text is analyzed after an in-flight request completes.
- Ignore stale analyzer results from older turns.

Semantic results should be blended into the current state:

- Same emotion: increase confidence and intensity gradually.
- Different emotion: require confidence margin or a minimum hold time before switching.
- Neutral result: do not immediately erase a non-neutral local emotion unless neutral is explicitly allowed.

### Motion Stability

The director must not alternate gaze or head direction per token or per keyframe. It should use:

- Stable phase-level pose targets.
- Low-frequency micro motion.
- Per-parameter speed limits.
- Acceleration damping.
- Configurable `stability`, default `0.74`.

Body motion should be part of the same frame generation:

- `ParamBodyAngleX/Y/Z`
- `ParamAngleX/Y/Z`
- eye open, eye smile, eye squint, and eye ball parameters
- mouth form, mouth open, mouth shape, and mouth thickness
- brows and cheek parameters where available

## Public Interfaces

### `Live2DRealtimeMotionDirectorOptions`

```ts
interface Live2DRealtimeMotionDirectorOptions extends Live2DApplyOptions {
  engine: Live2DExpressionEngine;
  model?: Live2DParameterTarget;
  onFrame?: (params: Record<string, number>, meta: RealtimeMotionFrameMeta) => void;
  semanticAnalyzer?: EmotionAnalyzer;
  semanticStreamAnalyzer?: EmotionStreamAnalyzer;
  semanticIntervalMs?: number;
  smoothingMs?: number;
  stability?: number;
  expressiveness?: number;
  bodyMotion?: boolean;
  requestFrame?: (callback: Live2DFrameCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
}
```

At least one of `model` or `onFrame` is required.

### `Live2DRealtimeMotionDirector`

```ts
interface Live2DRealtimeMotionDirector {
  startTurn(input: { promptText: string }): void;
  pushAssistantDelta(delta: string): RealtimeMotionFrameMeta | null;
  pushSemanticIntent(intent: EmotionIntent): RealtimeMotionFrameMeta;
  finishAssistantText(): void;
  reset(): void;
  stop(): void;
}
```

## Demo Plan

Update the web demo so `Stream Reply` uses the realtime director:

1. Call `startTurn({ promptText })` before `/api/chat-stream` starts returning tokens.
2. Call `pushAssistantDelta(delta)` for every SSE delta.
3. Run `/api/emotion-stream` or a package analyzer with `stream()` as background semantic calibration, not as a blocking final step.
4. Call `pushSemanticIntent(intent)` when the analyzer returns.
5. Call `finishAssistantText()` when the stream ends.

The demo should show:

- current motion phase
- current local emotion
- current semantic emotion if available
- whether semantic calibration is pending

## Test Plan

### Unit Tests

- `startTurn` emits non-empty base motion frames before assistant text exists.
- `pushAssistantDelta` updates expression within 200ms without waiting for an analyzer.
- Slow semantic analysis does not block frame generation.
- Stale semantic results are ignored after `reset` or a new turn.
- Conflicting semantic intent blends smoothly instead of snapping.
- Body, head, gaze, and mouth parameters obey speed limits.
- Neutral semantic results do not erase a visible local emotion unless configured.

### Integration Tests

- Simulate shy praise, happy success, surprise, sad recovery, and panic prompts.
- Simulate a 20s delayed analyzer response while streaming continues.
- Verify frame metadata transitions through `thinking -> streaming -> reacting/calibrating -> settling`.

### Demo Verification

- Browser opens `http://127.0.0.1:5175/demo/`.
- Clicking `Stream Reply` starts visible motion before the final analyzer returns.
- Motion continues while the assistant text streams.
- Final semantic calibration changes emotion only through a smooth transition.
- Browser console has no errors.

## Defaults

- Strategy: local first, asynchronous LLM calibration.
- `semanticIntervalMs`: `700`.
- `smoothingMs`: `260`.
- `stability`: `0.74`.
- `expressiveness`: `1.72`.
- `bodyMotion`: `true`.
- LLM output remains semantic JSON only; it must not include raw Live2D parameter IDs or keyframe sequences.
- Emotion output is layered: `emotion` is broad, optional `tone` refines the reaction with concerned, reassuring, relieved, proud, playful, bashful, determined, disappointed, nervous, excited, grateful, amused, skeptical, focused, apologetic, frustrated, or startled motion profiles.

## Non-goals

- The package does not own the chat completion request itself.
- API keys must not be bundled into browser code.
- The realtime director should not require a specific runtime. It must work with direct model application or host-provided `onFrame`.
