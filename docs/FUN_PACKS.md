# Fun packs and the REVLINE voice synthesiser (update 30)

There are six packs and 39 engines. None of them use recordings or brand names: every sound is generated in the app.

| Pack (id) | Engines |
|---|---|
| CRAZY PACK / ŠÍLENOSTI (`crazy`) | atomic mushroom, starship warp drive, UFO, rocket launch, dragon, BRRRM cartoon, chainsaw, lawnmower, kitchen blender, T-rex, 8-bit robot |
| TWO-STROKE FUN / DVOUTAKTY (`two-stroke`) | moped 50, paper car 600, east sedan 1.0, GP 125, kart 100 |
| RETRO JUNKYARD / RETRO ŠROT (`retro-junkyard`) | Maluch 650, old hatch 1.6 D, rear-engine 1.2, Soviet sedan 1.5, leaky exhaust 1.3, beer van 2.4 D |
| MOTORBIKES / MOTORKY (`motorbikes`) | superbike 1000 I4, V-twin cruiser, triple 900, enduro 450 single, boxer twin 1250 |
| AIRCRAFT / LETADLA (`aircraft`) | helicopter, radial warbird, jet airliner, fighter afterburner, turboprop, ultralight |
| LOCOMOTIVES / LOKOMOTIVY (`locomotives`) | steam, singing electric loco, electric loco, diesel loco, tram, metro |

- The engines live in `src/profiles/funEngines.ts`, with one row per engine. Gearing is computed from the top speed at the limiter.
- The sound recipes live in `src/audio/placeholder/voices.ts`, and the renderer in `voiceSynth.ts`. A recipe combines firing/chuff/blade
  events, formant resonators, an exhaust-pipe comb and a body low-pass, plus loop-locked tones and noise, rumble and crackle layers. All filters run
  circularly, so loops have no seam. `tests/voices.test.ts` checks every band for silence, clipping, NaN and seam clicks.
- Rendering takes 0.1–0.8 s per engine. It runs in a Web Worker (`voiceWorker.ts`), so the HUD never freezes. If the
  worker cannot start, rendering falls back to the main thread.
- Pack names, prices and texts are in `src/profiles/packs.ts`. Rename freely: the pack `id` must stay.

# REVLINE PRO: edit any engine

In Garage → engine → **EDIT ENGINE** the Sound Studio opens with that engine's settings.
- **OVERWRITE FOR ME** saves a spec with `overrides: <built-in id>`. The session swaps the built-in for this version, keeping the
  same id, so selection, favourites and packs still work. It applies only while PRO is active and only in this browser.
  **RESTORE ORIGINAL** deletes the edit.
- **SAVE AS NEW** adds the engine to the Garage as a new custom engine. The original is unchanged.
- Fun-pack sounds can be borrowed in the Studio too (group "REVLINE synth voices"). Studio limits were widened for bikes,
  locomotives and similar engines: 1–16 cylinders, idle 350–3,000, redline 900–20,000, 1–10 gears, final drive 0.5–20.
