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

## Milestone 4 – Platform and community

Goal: easy to install, easy to share, easy to contribute to.

- [ ] Installable PWA with offline support (manifest is in, needs a service worker).
- [ ] Electron / Tauri desktop builds published on GitHub Releases via CI.
- [ ] Leaderboards for drills (opt-in, no accounts: signed result tokens).
- [ ] Localisation: JP, KR, ES, FR, DE strings.
- [ ] Accessibility: colour-blind safe result palette, reduced-motion mode, screen-reader labels.
- [ ] Contributor guide, issue templates, unit tests for the detector and movement in CI.

## Ideas parking lot

- Ghost overlay of your best attempt while you try again.
- Rhythm-game style metronome for the electric loop.
- Two-player local versus on one keyboard / two pads (the ragdolls already support it).
- Replay export as GIF.
- Hit-box / hurt-box visualiser toggle.
