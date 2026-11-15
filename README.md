# Rubble Town

A small, fully destructible 3D test town. You play a flying android (white shell, olive
plate carrier, glowing yellow eyes) with super speed, charged punches and laser eyes, plus a
crash-test dummy you can punch, laser, grab and throw through buildings.

Runs in the browser with [three.js](https://threejs.org) (loaded from the jsDelivr CDN), no build step.

## Run it

Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Add `?q=0` … `?q=3` to force Low / Medium / High / Ultra render quality (otherwise it starts on
High and steps down automatically if the frame rate drops).

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | move |
| `Space` | jump; press again in the air to fly; climb while flying |
| `C` | descend |
| `Shift` | super speed (flying at speed smashes straight through buildings) |
| `F` | toggle flight (drop from height for a super landing) |
| Left click / `J` | punch, hold to charge a bigger one |
| Right click / `K` | laser eyes (hold) |
| `E` | grab the dummy, press again (or click) to throw it |
| `R` | new dummy in front of you |
| `T` | rebuild the town |
| `V` | switch character (Android / Spectre V-01) |
| `O` | ink outlines on/off |
| `Q` | cycle render quality |
| `H` | hide the controls panel |

## How it works

- `src/voxels.js` — buildings are 0.5 m blocks in a voxel grid, drawn as instanced meshes.
  Removing blocks and a flood-fill "is this still connected to the ground?" check make
  unsupported parts collapse.
- `src/debris.js` — broken blocks become rigid rubble (box corner contacts with friction,
  chunk-to-chunk contacts, sleeping). Fast rubble can knock out more blocks.
- `src/dummy.js` — Verlet ragdoll. Body parts moving fast enough punch holes in walls.
- `src/robot.js` — the procedural android model and its poses (walk, hover, superhero flight,
  punch wind-up/strike, laser aim, carrying).
- `src/spectre.js` — Spectre V-01: caped purple mecha with a red mono-eye laser, built on the same rig.
- `src/outline.js` — optional inverted-hull ink outline for the characters.
- `src/effects.js` — dust, sparks, shockwaves, laser beams, scorch marks.
- `src/textures.js` — all textures (brick, plaster, concrete, glass, asphalt…) are generated
  procedurally at start-up, with normal and roughness maps.
- `src/main.js` — renderer, sky and image-based lighting, shadows, post-processing
  (GTAO ambient occlusion, bloom, SMAA, vignette), controls, combat and camera.
