# Expressive Streaming Motion Plan

## Goal

Make the package produce visibly emotional Live2D performances during real web chat:

1. Immediately predict a preset expression from the user message.
2. Keep the model moving while the assistant response streams.
3. Continuously correct emotion, tone, and intensity from streamed LLM chunks.
4. Use the model's inspected parameter capability to drive richer facial and body motion.
5. Avoid static waiting, delayed final-only emotion changes, and tiny unreadable movement.

The package should stay runtime-agnostic. Web apps install the package, declare a model directory or URL resources, inspect capability, then use exported methods/controllers to drive their chosen Live2D runtime.

Runtime adapters should expose the target setter boundary too. For runtimes that can soften or overwrite expression parameters through an outer model wrapper, hosts can choose `applyTarget: "all"` so realtime params are written through every discovered visible setter. Use `applyTarget: "core"` when the host has verified that the core model is the only effective setter.

`pixi-live2d-display` also needs render-loop-aware timing. If the host calls the director from the Pixi ticker after the model has updated, `applyTiming: "immediate"` writes the visible overlay before render. `applyTiming: "before-model-update"` is still available for integrations whose runtime event ordering has been verified to run after motion, expression, blink, focus, and physics updates.

## Current Direction

The realtime chain is the right shape:

- `startTurn(...)` starts motion from local prompt prediction.
- `pushAssistantDelta(...)` updates motion as response chunks arrive.
- `OpenAICompatibleEmotionAnalyzer.stream(...)` can emit semantic intents from streamed LLM output.
- `Live2DRealtimeMotionDirector` blends local and semantic signals without waiting for final JSON.
- Frame metadata exposes `presetId` and layer weights for debugging.

The remaining gap is acting quality:

- The preset catalog now covers more high-emotion cases, but real conversations still need broader samples.
- Larger motion is readable, but full face/body switches must be paced so chunk sync does not look mechanical.
- Expression effects need to stay deliberate instead of changing on every short semantic chunk.

## Current Checkpoint

The first expression-expansion pass now includes:

- 132 default local signal presets.
- Model inspection for optional eye, tear, emotion, breath, and fire effects.
- Layered realtime face, speech, gaze, body, breath, accent, and mask motion.
- A slower segmented facial-beat layer for smile blooms, shy glances, soft blinks, alarm spikes, skeptical asymmetry, lip tightening, and tear release without token-synchronous restarts.
- Exported realtime layer composition now drives reusable pose and breath layers for custom render loops.
- Separate `delighted` and `startled` tones for positive surprise versus alarm.
- Separate `flustered` and `bashful` tones for embarrassed heat versus ordinary shyness.
- Additional `celebratory`, `tender`, `wistful`, and `guarded` tones for strong joy, warmth, longing, and caution.
- Local presets for closed-eye celebration, bracing panic, relieved tears, tear-drop embarrassment, startled confusion, and relieved sleepiness.
- Additional dialogue presets for delighted gifts, determined incident takeover, playful shyness, apologetic embarrassment, amused confusion, suspicious anger, tender comfort, and sleepy gratitude.
- Nuanced transition presets for quiet pride, warm relief, gentle gratitude, alert spikes, incident recovery, positive surprise, flustered praise, smug or mischievous teasing, metric skepticism, careful review, guarded frustration, gentle reassurance, heavy concern, and cozy sleepiness.
- High-intensity and conversation-beat presets for sparkling delight, relief laughing, hyperventilating panic, blank shock, cover-face embarrassment, side-eye teasing, tongue-out teasing, deadpan confusion, silent glare, welling tears, sobbing, sleepy head-nodding, nervous laughter, double-take surprise, silent tears, angry eye-twitching, fake innocence, and soft comfort.
- Realtime tear flow pulses through safe `ParamTearDisappear_*` controls.
- Optional safe controls add cheek puff, asymmetric squint, lip pucker, tongue, mouth-corner modifiers, richer eyelids, and crying depth when the inspected model exposes them.
- First semantic correction for non-critical local guesses waits for a short entry beat, so the first local reaction is visible before the face changes.
- Calming `panic/reassuring` motion that reduces pupil quake after an incident peak.
- Default realtime expressiveness is raised to 3.2, smoothing defaults to 360ms, and stability defaults to 0.68 so host apps get readable motion without token-synchronous twitch.
- Default realtime pacing now uses longer human-readable residence windows: local macro switches hold for 1900ms and semantic stream switches hold for 3200ms, while chunks continue driving slower speech, gaze, breath, and facial micro motion.
- Streamed semantic candidates must repeat or remain stable across `performanceBeatMs` before replacing the active full-face performance, so model JSON updates can stay low-latency without making the character visibly switch faces on every chunk.
- Broad emotion or explicit expression-mask changes start a new onset/accent beat. Same-emotion tone, pose, and facial-style refinements glide toward the updated target without restarting the full transition.
- Tone-level readability anchors now keep concerned, skeptical, apologetic, flustered, and startled states visible even after speech motion ends.
- Tone/style/preset semantic intents now get a readability amplifier over broad emotion-only mapping, so LLM-selected presets produce visibly different face contours.
- Expression masks preserve stronger mapped tear, crying, and effect parameters instead of flattening them to `.exp3` defaults.
- Explicit preset ids now materialize their declared tone, facial style, gaze, head, eye, brow, mouth, and optional expression defaults before mapping, so nuanced local presets are not only metadata.
- A short-lived onset contour makes strong eye, brow, cheek, and mouth shapes readable during the first transition beat while the smoothed core target continues settling.
- Ordinary high-intensity `happy + excited` remains open-eyed; `closed_eye_smile` is reserved for celebration presets or explicit intents so positive reactions do not collapse into one mask.
- Mixed success-plus-risk wording is biased toward concern or skepticism instead of being classified as pure happy because of early success keywords.

The next pass should expand preset families from real dialogue samples and tune model-specific motion manifests without hard-coding Yachiyo-only behavior into the public engine.

## Parameter Strategy

Treat model inspection as the source of truth:

- Use VTube mappings and expression presets as primary safe controls.
- Use CDI metadata to discover optional expressive controls.
- Keep physics downstream parameters blocked.
- Drive only inspected direct visual controls from realtime layers; let the model physics chain react naturally to them.
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
- Slower facial beats that turn safe eye, brow, cheek, mouth-corner, pupil, and tear controls into readable 2.5 to 4.3 second contours.
- Speech mouth motion from recent assistant chunks.
- Gaze and attention layer for small eye/head movement.
- Pose/body layer for emotional posture.
- Symbolic motion-performance layer for reusable body-language motifs such as bounce, peek, flinch, tremble, side-eye, sob, nod, and yawn.
- Breath/emotional breathing layer.
- Accent layer for short reaction emphasis.
- Mask/blink layer for expression texture switches.

Layer weights should be exposed through `meta.layers` so host apps can debug why the model is moving.

## Amplitude Strategy

The default should be visibly expressive, not barely perceptible:

- Raise default realtime `expressiveness` enough to read clearly while pacing transitions with longer residence windows.
- Allow host apps to push expressiveness higher for demos.
- Increase safe intensity floors for strong tones like excited, startled, nervous, frustrated.
- Keep speed limits and smoothing so larger motion does not become jitter.
- Use expression effects for high-intensity moments instead of only increasing numeric mouth/eye values.

## LLM Stream Strategy

LLM output should guide expression continuously:

- Local preset prediction appears first and never waits for remote analysis.
- Assistant text chunks feed local keyword/punctuation matching immediately.
- Local chunk matching favors the newest assistant fragment, so expression can follow mid-reply turns from alarm to reassurance or joy to suspicion.
- Macro performance switches use human-readable residence windows and candidate dwell beats after the first meaningful reaction. Intermediate chunks keep speech, gaze, breath, and facial micro motion active without restarting the face transition for every token. Same-emotion tone, pose, and facial-style refinements glide inside the active beat. Strong sentence-boundary changes also wait for the same beat window instead of using a shorter token-synchronous shortcut.
- Partial streamed semantic objects are treated as candidates; a new candidate needs repetition plus stable dwell time, or a longer single-candidate dwell, before it replaces the current performance. The final complete-reply event can still settle immediately.
- Streamed semantic analyzer emits structured emotion intents as soon as partial JSON is parseable, but the director paces adoption through entry beats and candidate dwell windows.
- Semantic corrections update emotion/tone/intensity and optional whitelisted `presetId` gradually.
- Final semantic calibration supersedes stale partial-reply requests and emits one resting intent.
- The final result settles the expression but should not be the first visible emotional change.

The LLM should not output raw Live2D parameter IDs by default. It should output emotion/tone/intensity/preset-style semantic intents. The OpenAI-compatible analyzer now advertises a compact default preset performance catalog with each whitelist id's emotion, tone, facial style, inferred motion style, and optional expression mask. This gives the model enough meaning to choose matching `presetId` values instead of guessing from bare ids, and the package maps those semantic presets to amplified safe model parameters and capability-filtered body-language motifs.

## Demo Expectations

The demo should prove the full flow:

1. User sends an emotional message.
2. Model immediately shows a local predicted preset.
3. Assistant text streams.
4. Mouth/speech layer and face layer move during chunks.
5. Semantic stream updates the displayed `emotion/tone/presetId`.
6. Final expression matches the assistant reply without a long static wait.
7. Layer metadata remains visible for debugging, including `motionStyle`, `facialBeat`, and the `performance` layer weight.

For a long-running local demo, keep provider configuration in the Git-ignored `.env.local` file. Vite loads `LIVE2D_LLM_BASE_URL`, `LIVE2D_LLM_MODEL`, and `LIVE2D_LLM_API_KEY` server-side once at startup; the browser bundle never receives the key.

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
