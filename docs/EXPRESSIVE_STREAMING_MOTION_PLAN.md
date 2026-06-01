# Expressive Streaming Motion Plan

## Goal

Make the package produce visibly emotional Live2D performances during real web chat:

1. Immediately predict a preset expression from the user message.
2. Keep the model moving while the assistant response streams.
3. Continuously correct emotion, tone, and intensity from streamed LLM chunks.
4. Use the model's inspected parameter capability to drive richer facial and body motion.
5. Avoid static waiting, delayed final-only emotion changes, and tiny unreadable movement.

The package should stay runtime-agnostic. Web apps install the package, declare a model directory or URL resources, inspect capability, then use exported methods/controllers to drive their chosen Live2D runtime.

## Current Direction

The realtime chain is the right shape:

- `startTurn(...)` starts motion from local prompt prediction.
- `pushAssistantDelta(...)` updates motion as response chunks arrive.
- `OpenAICompatibleEmotionAnalyzer.stream(...)` can emit semantic intents from streamed LLM output.
- `Live2DRealtimeMotionDirector` blends local and semantic signals without waiting for final JSON.
- Frame metadata exposes `presetId` and layer weights for debugging.

The remaining gap is expressiveness:

- The default preset catalog is still too small for real conversations.
- Several Yachiyo CDI parameters are present but were not previously safe-ranged or driven.
- Motion amplitude is still conservative compared with the model's visual capacity.
- Expression effects need to be used deliberately, not just eye/mouth/head numeric changes.

## Current Checkpoint

The first expression-expansion pass now includes:

- 30 default local signal presets.
- Model inspection for optional eye, tear, emotion, breath, and fire effects.
- Layered realtime face, speech, gaze, body, breath, accent, and mask motion.
- Separate `delighted` and `startled` tones for positive surprise versus alarm.
- Separate `flustered` and `bashful` tones for embarrassed heat versus ordinary shyness.
- Immediate first-chunk semantic correction for non-critical local guesses.
- Calming `panic/reassuring` motion that reduces pupil quake after an incident peak.

The next pass should expand preset families from real dialogue samples and tune model-specific motion manifests without hard-coding Yachiyo-only behavior into the public engine.

## Parameter Strategy

Treat model inspection as the source of truth:

- Use VTube mappings and expression presets as primary safe controls.
- Use CDI metadata to discover optional expressive controls.
- Keep physics downstream parameters blocked.
- Add controlled fallback ranges only for known direct visual effect parameters.
- Fold unsupported advanced parameters into simpler supported controls for custom models.

New candidate effect controls for Yachiyo-style models:

- `ParamEyeCircles` for dizzy/confused/sleepy panic effects.
- `ParamPupilQuake_L1` and `ParamPupilQuake_R1` for panic, shock, nervousness.
- `ParamEyeOpenBlink_L1/L2` and `ParamEyeOpenBlinkOF_L1/L2` for bright surprise/excitement.
- `ParamTearDown_1/2/3` and `ParamCryDown_L` for sadness and crying.
- `ParamBreathPhysics_L` for heightened emotional breathing.
- `fire` for anger/frustration effects.

## Preset Expansion

The preset catalog should grow beyond broad emotions. Each preset should combine:

- `emotion`: broad state such as happy, panic, sad, confused.
- `tone`: fine state such as relieved, startled, apologetic, skeptical.
- target modifiers: eyes, brows, mouth, gaze, head, special expression.
- optional visual effects when the inspected model supports them.

Priority preset families:

- Happy: excited, proud, relieved, grateful, playful.
- Panic: nervous, startled, reassuring, focused recovery.
- Sad/Crying: disappointed, concerned, apologetic, tears.
- Confused: skeptical, concerned, focused diagnosis.
- Angry: frustrated, determined, focused.
- Shy/Embarrassed: bashful, grateful, awkward praise.
- Surprise: startled, excited success.
- Teasing/Amused: playful, amused, smirk.

## Motion Layer Strategy

Realtime frame composition should remain layered:

- Core target expression from `engine.generateFromIntent(...)`.
- Facial micro expression for eyes, brows, cheeks, and mouth.
- Speech mouth motion from recent assistant chunks.
- Gaze and attention layer for small eye/head movement.
- Pose/body layer for emotional posture.
- Breath/emotional breathing layer.
- Accent layer for short reaction emphasis.
- Mask/blink layer for expression texture switches.

Layer weights should be exposed through `meta.layers` so host apps can debug why the model is moving.

## Amplitude Strategy

The default should be visibly expressive, not barely perceptible:

- Raise default realtime `expressiveness`.
- Allow host apps to push expressiveness higher for demos.
- Increase safe intensity floors for strong tones like excited, startled, nervous, frustrated.
- Keep speed limits and smoothing so larger motion does not become jitter.
- Use expression effects for high-intensity moments instead of only increasing numeric mouth/eye values.

## LLM Stream Strategy

LLM output should guide expression continuously:

- Local preset prediction appears first and never waits for remote analysis.
- Assistant text chunks feed local keyword/punctuation matching immediately.
- Streamed semantic analyzer emits structured emotion intents as soon as partial JSON is parseable.
- Semantic corrections update emotion/tone/intensity gradually.
- Final semantic result settles the expression but should not be the first visible emotional change.

The LLM should not output raw Live2D parameter IDs by default. It should output emotion/tone/intensity/preset-style semantic intents, and the package maps them to safe model parameters.

## Demo Expectations

The demo should prove the full flow:

1. User sends an emotional message.
2. Model immediately shows a local predicted preset.
3. Assistant text streams.
4. Mouth/speech layer and face layer move during chunks.
5. Semantic stream updates the displayed `emotion/tone/presetId`.
6. Final expression matches the assistant reply without a long static wait.
7. Layer metadata remains visible for debugging.

## Validation

Required checks before packaging or handing off major changes:

- `npm run build`
- `npm run test:ts`
- `python3 -m pytest`
- `npm --cache /private/tmp/nature-live2d-npm-cache pack --dry-run`
- `git diff --check`
- Secret scan for API keys and debug markers.
- Browser demo smoke test on `http://127.0.0.1:5175/demo/` when frontend/demo behavior changes.

## Open Work

- Tune the new effect parameters visually in the demo and reduce any overdone values.
- Add more preset tests for the expanded catalog.
- Add regression tests proving effect parameters are safe-ranged and present in generated high-intensity poses.
- Add a demo scenario list that stresses praise, panic, relief, apology, teasing, frustration, and surprise.
- Decide whether model-specific optional visual effect parameters should remain built-in common fallbacks or move into an explicit host-provided mapping profile.
