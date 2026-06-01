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
  applyTarget: "all",
  applyTiming: "immediate",
  semanticAnalyzer,
  stability: 0.68,
  smoothingMs: 360,
  transitionMs: 820,
  reactionHoldMs: 1900,
  semanticReactionHoldMs: 3200,
  performanceBeatMs: 1360,
  expressiveness: 3.2,
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
- **Semantic calibration**: asynchronous or streamed LLM analyzer results. It corrects emotion, tone, intensity, and optional whitelisted `presetId` over time without direct snapping. Analyzer prompts should prefer matching whitelisted preset ids because preset ids carry richer visible performance detail than broad emotion alone.
- **Runtime frame layers**: core target expression, facial readability anchors, a short-lived onset contour for the first transition beat, facial micro expression, a slower segmented facial beat, speech mouth motion, attention/gaze motion, body pose, symbolic motion performance, breath, transition accent, and expression-mask blink. These are composed every frame after model capability filtering. The slower facial beat uses 2.5 to 4.3 second contours so eye, brow, cheek, mouth-corner, pupil, and tear texture can remain expressive without restarting on every streamed chunk.
- **Optional model texture**: inspected safe controls such as richer eyelids, cheek puff, asymmetric squint, lip pucker, tongue, mouth-corner modifiers, and tear depth enrich a supported model without directly writing physics downstream parameters. Semantic intents with tone/style/preset metadata get an additional readability amplifier, and expression masks preserve stronger mapped tear or crying values instead of flattening them.
- **Performance residence**: the first meaningful reply fragment may react immediately, but later macro expression changes use human-readable hold windows plus a candidate dwell beat. While a full face switch is held, chunks still drive speech, gaze, breath, and facial micro motion. Broad emotion or explicit expression-mask changes start a new onset/accent beat; same-emotion tone, pose, and facial-style refinements glide toward the new target without restarting the full transition. Streamed semantic candidates must repeat or remain stable across the beat before replacing the active performance, so token-level JSON churn does not become visible face flipping.

Local affect is backed by an exported preset catalog, and the OpenAI-compatible analyzer advertises the same catalog to the LLM. Host apps can inspect `getDefaultEmotionSignalPresets()`, override estimator rules, call `resolveEmotionSignalPreset(intent)` to find a matching preset id, call `materializeEmotionSignalPreset(intent)` to expand an explicit preset id into declared tone, facial style, motion style, gaze, head, eye, brow, mouth, and optional expression defaults before mapping, or call `resolveMotionPerformanceStyle(intent)` to infer a reusable capability-safe movement motif. Analyzer output keeps only known preset ids and drops hallucinated ids.

The reusable `applyRealtimeMotionLayers(...)` helper should include pose and breath output too, so host apps with their own runtime adapter can reuse the same body motion without adopting the full director.

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

- Trigger every `semanticIntervalMs`, default `800`.
- Trigger at sentence boundaries when useful.
- Coalesce pending analysis so only the latest text is analyzed after an in-flight request completes.
- When the assistant stream finishes, supersede older partial-reply requests immediately and consume one final resting intent.
- Ignore stale analyzer results from older turns.
- Local reply matching should favor the newest reply fragment over the full accumulated reply, so current chunks can move the face before semantic calibration finishes.

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
- Configurable `stability`, default `0.68`.

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
  transitionMs?: number;
  smoothingMs?: number;
  reactionHoldMs?: number;
  semanticReactionHoldMs?: number;
  performanceBeatMs?: number;
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

For a persistent local demo, load provider settings from the Git-ignored `.env.local` file at Vite startup. The API key remains server-side and is not exposed to browser code.

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
- `semanticIntervalMs`: `1250`.
- `smoothingMs`: `360`.
- `transitionMs`: `820`.
- `reactionHoldMs`: `1900`.
- `semanticReactionHoldMs`: `3200`.
- `performanceBeatMs`: `1360`.
- `stability`: `0.68`.
- `expressiveness`: `3.2`.
- `bodyMotion`: `true`.
- `applyTarget`: host-selectable runtime write target. Use `"all"` with `pixi-live2d-display` when a wrapper/core ordering issue may hide visible expression changes; use `"core"` when the host has confirmed the core model is the only effective setter.
- `applyTiming`: host-selectable runtime write timing. Use `"immediate"` when the host calls the director from the runtime ticker after the model update; use `"before-model-update"` only when the runtime's event ordering has been verified for that integration.
- LLM output remains semantic JSON only; it may include whitelisted `presetId` values but must not include raw Live2D parameter IDs or keyframe sequences.
- Emotion output is layered: `emotion` is broad, optional `tone` refines the reaction, and optional symbolic `facialStyle` selects an inspected safe-control face texture without exposing raw model parameter ids.
- Expression masks remain sparse accents: ordinary high-intensity `happy + excited` stays open-eyed, while a celebration preset or explicit intent can request `closed_eye_smile`.

## Non-goals

- The package does not own the chat completion request itself.
- API keys must not be bundled into browser code.
- The realtime director should not require a specific runtime. It must work with direct model application or host-provided `onFrame`.
