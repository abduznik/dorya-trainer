# Dorya Trainer

A just-frame trainer for the **Electric Wind God Fist** (f, n, d, d/f+2), built with
Three.js, cannon-es and Vite. Runs in any browser and exports to a static folder,
Electron, or Tauri.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

## What it is

- **Free training** on an endless stage with a Tekken-style input display, frame-offset
  histogram, motion progress chips, and a dummy that gets launched and gets back up.
- **Drills**: ten electrics in a row, wavedash ×3 into electric, Korean backdash ×8. Times
  are recorded per drill.
- **Authentic input rules**: fixed 60 Hz sampling, electric only when 2 lands on the exact
  d/f frame, regular WGF for a late 2 during the crouch dash, crouch dash on f,n,d,d/f,
  wavedash by tapping f to cancel each crouch dash, f,f dash, b,b backdash, d/b cancel for
  the Korean backdash. Forward is always toward the dummy.

## Characters: active ragdolls, no animation

Both characters are chunky blocky ragdolls: eleven rigid bodies joined by cone-twist
constraints. The hips and chest are steered by a velocity-blend motor (upright and at a
target height), and every other joint has a PD "muscle" that torques the limb toward a
target pose. Walking, crouching, punching and the uppercut are all just target poses; the
lunge is an impulse; a launch simply switches the dummy's muscles off, and it stands back
up because they switch on again. The technique follows the usual active-ragdoll recipe
(hover root + joint drives + weaken-on-impact) used by Gang Beasts style games.

## Controls

| Action     | Keyboard         | Controller (standard mapping) |
|------------|------------------|-------------------------------|
| Directions | WASD / arrows    | D-pad or left stick           |
| 1 / 2      | J / K (or U / I) | Square·X / Triangle·Y         |
| 3 / 4      | L / ;            | Cross·A / Circle·B            |

Mouse: drag to orbit the camera, wheel to zoom. It never triggers attacks. Everything is
rebindable in Settings and persists in localStorage.

## Export

Static build (itch.io, any web host, or `file://`):

```
npm run build      # -> dist/
```

Desktop app with Electron:

```
npm i -D electron electron-builder
npm run build && npm run desktop     # run it
npm run dist:win                     # portable build in release/
```

Optional: drop a `public/sfx/dorya.mp3` into the project and it plays on every electric.

## Layout

- `src/input.js`    keyboard / gamepad, sampled once per sim frame
- `src/ewgf.js`     the f,n,d,d/f+2 state machine and session stats
- `src/movement.js` walk, dash, backdash, crouch dash, wavedash, Korean backdash
- `src/ragdoll.js`  blocky active ragdoll: bodies, joints, muscles, attacks, hit reactions
- `src/physics.js`  cannon-es world
- `src/fx.js`       lightning burst effect
- `src/scene.js`    renderer, follow camera, lighting, endless floor
- `src/ui.js`       HUD, input history, settings panel
- `src/main.js`     modes, drills, 60 Hz loop wiring it all together
