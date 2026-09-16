# Dorya Trainer roadmap

Live: https://abduznik.github.io/dorya-trainer/ · Issues and milestones: https://github.com/abduznik/dorya-trainer/issues

## Where it stands (v1.0, September 2026)

- Exact 60 Hz just-frame detection for EWGF (f, n, d, d/f+2) and PEWGF (f, n, d/f+2), with per-attempt frame offsets, a histogram and a Tekken-style input display.
- Mishima movement: crouch dash, wavedash, dash, run, backdash, Korean backdash.
- Active-ragdoll characters (no animation clips): stance, walk, crouch, attacks, launch, Tekken-style juggle with a loopable electric, knockdown and recovery.
- Free training plus three timed drills, rebindable keyboard and controller, PS2-garage UI, GitHub Pages deploy.

## Milestone 1 – Feel and feedback

Goal: the trainer tells you *why* an electric failed and feels crisp on every input device.

- [ ] Per-input timeline strip after each attempt: which frame each direction and button landed on, with the just frame highlighted.
- [ ] "Last 10 attempts" replay: scrub through inputs frame by frame.
- [ ] Sound design pass: distinct EWGF / PEWGF / WGF / whiff cues, optional voice sample slot for dorya.mp3 (already wired).
- [ ] Hit-stop and screen flash on electric, subtle camera push-in on launch.
- [ ] Controller polish: stick vs d-pad choice, SOCD cleaning for leverless, per-device dead zone presets.

## Milestone 2 – Practice modes

Goal: structured practice that maps to what people actually grind in Tekken.

- [ ] Drill editor: pick a sequence (e.g. wavedash ×N into electric, electric loop ×N, KBD ×N) and a target, save custom drills.
- [ ] Electric loop drill: count consecutive juggle electrics, show the tempo between hits.
- [ ] Mist step / PEWGF drill and a ws2-into-electric link drill.
- [ ] Session history: rate over time, best streaks, exportable as JSON/CSV.
- [ ] Daily challenge seed and a shareable result card (image).

## Milestone 3 – Authenticity

Goal: match Tekken's rules closely enough that habits transfer 1:1.

- [ ] Verify all frame windows against Tekken 8 (input buffer, crouch dash cancel timing, backdash cancel frames) and expose them as a "ruleset" preset: T7 / T8.
- [ ] Sidestep and sidewalk (u / d taps) with a proper 3D lane, plus tracking on the electric.
- [ ] Whiff and block reactions on the dummy (guard stance when holding back, block push-back, counter-hit flag).
- [ ] Character variants: Kazuya, Heihachi, Devil Jin, Reina inputs and startup differences (e.g. Reina's electric, Heihachi's ws-electric).
- [ ] Stage walls and wall splat for wall-carry practice.

## Milestone 4 – Generic motion engine (prerequisite for anything beyond the electric)

Goal: the detector becomes data, not code, so a new move or a new game is a spec file, not a rewrite.

Sequencing matters here: do this *before* adding other characters or games, otherwise every new
execution drags EWGF assumptions deeper into the code.

- [ ] Motion grammar: describe a move as a list of steps (direction sets, button sets, "same frame as"
      constraints, min/max frames between steps, hold durations, charge times, neutral requirements).
      EWGF, PEWGF, wavedash and KBD must be re-expressed in the grammar with zero behaviour change,
      verified by the existing headless tests.
- [ ] Multi-button and simultaneous-press handling (1+2, 3+4, plinks) with a configurable plink window.
- [ ] Charge inputs (hold b for N frames, then f+button) and charge partitioning.
- [ ] Per-move result classes beyond electric / regular / fail: e.g. "came out but not the just-frame
      version", "buffered too early", "dropped the charge".
- [ ] Generic feedback: the frame-offset histogram, timeline strip and drills work for any move in the
      grammar, not just button 2 relative to d/f.
- [ ] Move library format (JSON) with a game, character, notation style (numpad vs Tekken), and a
      "reference" section (source links, startup frames) shown in Help.

## Milestone 5 – Beyond the electric

Goal: other addictive hard executions, in the same drill-and-histogram loop. Ordered by how much of
the existing Tekken setup they reuse.

1. Tekken, same character: instant while-standing (iWS), DEWGF / f,n,d,d/f+2 from crouch dash cancel
   variants, Heihachi EWGF and electric wind hook fist, Devil Jin and Reina electrics.
2. Tekken, other characters: Hwoarang JFSR, Bryan taunt jet upper (just frame taunt), Lee just-frame
   slide, Steve's b+1 cancels. Needs per-character move specs and a neutral "dummy" reaction set.
3. Other games, motion-based: Street Fighter (charge partitioning, Guile / Balrog, Zangief 720),
   KOF (hyper-hop and short-hop timing, super motions), Guilty Gear (Dragon Install, Roman cancel
   timing). These need only the motion engine plus a 2D input display; no ragdoll changes.
4. Other games, timing-based: Smash (perfect wavedash, L-cancel), Melee-style frame-perfect inputs,
   using the same histogram feedback with a frame-window slider.

Each new game ships as a move-library file plus, where needed, a display preset (numpad notation,
button colours), so the app can present a "game select" on the start screen.

## Milestone 6 – Platform and community

Goal: easy to install, easy to share, easy to contribute to.

- [ ] Installable PWA with offline support (manifest is in, needs a service worker).
- [ ] Electron / Tauri desktop builds published on GitHub Releases via CI.
- [ ] Leaderboards for drills (opt-in, no accounts: signed result tokens).
- [ ] Localisation: JP, KR, ES, FR, DE strings.
- [ ] Accessibility: colour-blind safe result palette, reduced-motion mode, screen-reader labels.
- [ ] Contributor guide, issue templates, unit tests for the detector and movement in CI.

## Suggested order

1. M1 feel and feedback (small, high value, no architecture risk).
2. M4 generic motion engine (the refactor everything after depends on).
3. M5 beyond the electric, starting with the Tekken-native items since they reuse the ragdolls.
4. M2 practice modes (drill editor is far more useful once there is more than one move).
5. M3 authenticity and M6 platform in parallel as capacity allows.

## Ideas parking lot

- Ghost overlay of your best attempt while you try again.
- Rhythm-game style metronome for the electric loop.
- Two-player local versus on one keyboard / two pads (the ragdolls already support it).
- Replay export as GIF.
- Hit-box / hurt-box visualiser toggle.
