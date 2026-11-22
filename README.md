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
| `E` | grab the dummy or lift a parked car; press again (or click) to throw it |
| `R` | new dummy in front of you |
| `T` | rebuild the town |
| `V` | switch hero (Sentinel / Spectre V-01 / Volt / Titan) |
| `8` | music on / off |
| `O` | ink outlines on/off |
| `X` | stop / resume time (no time limit) |
| `Z` | singularity: a black hole that tears up buildings and pulls everything in, then detonates |
| hold `B` | telekinesis: lift nearby rubble, cars and the dummy into orbit; release to fire them at your aim |
| `N` | thunderclap: a sonic boom that tunnels through whatever is in front of you |
| hold `L` | chain lightning: arcs from your hands chain between the dummy, cars, props and walls |
| `M` | meteor strike at your aim point |
| `Y` | blink strike: teleport to your aim point and detonate on arrival |
| `P` | gravity flip: everything near your aim point floats up, then slams down |
| `U` | hologram decoy: the dummy fights it instead of you, and it explodes when destroyed |
| `1` | missile barrage: a dozen homing micro-missiles |
| `2` | earthquake: shock rings roll out from you and bring buildings down |
| `3` | tornado: a wandering funnel that swallows everything loose |
| `G` | dummy fights back on/off |

All powers can be used as often as you like (no cooldowns).
| `Q` | cycle render quality |
| `H` | hide the controls panel |

## How it works

- `src/voxels.js` — buildings are 0.5 m blocks in a voxel grid, drawn as instanced meshes.
  Removing blocks and a flood-fill "is this still connected to the ground?" check make
  unsupported parts collapse.
- `src/debris.js` — broken blocks become rigid rubble (box corner contacts with friction,
  chunk-to-chunk contacts, sleeping). Fast rubble can knock out more blocks.
- `src/dummy.js` — Verlet ragdoll. Body parts moving fast enough punch holes in walls.
- `src/geom.js` — shared lathe / bevel-extrude / cable builders for the characters.
- `src/robot.js` — the Sentinel avatar model, palm thrusters and its poses (walk, hover, superhero flight,
  punch wind-up/strike, laser aim, carrying).
- `src/spectre.js` — Spectre V-01: purple mecha with a red mono-eye laser, built on the same rig.
- `src/heroes.js` — Volt (speedster: overdrive slows the world, lightning storm, bolt dash) and Titan (no flight, huge jumps and punches, boulder throw, ground pound, rage), each with their own kit. Sentinel and Spectre keep every power.
- `src/world.js` — the 24 km world around the town: hills, a northern mountain range, an eastern coast and sea, forests, a cloud layer and five far cities whose towers topple if you hit them at speed. Hold Shift + W in flight to keep accelerating: Mach 4 for Sentinel, Mach 3 for Spectre, Mach 5 for Volt, with a sonic boom and vapour cone at Mach 1.
- `src/boss.js` — COLOSSUS, the 16 m boss every sixth wave: drops from the sky, walks through buildings, stomps, backhands, throws building chunks and sweeps an eye beam.
- `src/life.js` — news helicopters, police that respond to destruction, a train line through the countryside and container ships at sea; all of them can be wrecked.
- `src/fire.js` — fire spread, burning/exploding cars and petrol pumps, hydrants and rain douse.
- `src/audio.js` — synthesized sound: reverb bus, layered impacts, rain, thunder, fire, day/night ambience, a procedural combat score.
- `src/outline.js` — optional inverted-hull ink outline for the characters.
- `src/cars.js` — parked cars: oriented-box rigid bodies, instanced; liftable, throwable, wall-smashing.
- `src/powers.js` — singularity, telekinesis and thunderclap.
- `src/props.js` — street furniture (hydrants that burst, bins, benches, mailboxes, cones).
- `src/birds.js` — pigeon flocks that scatter.
- `src/effects.js` — dust, sparks, shockwaves, laser beams, scorch marks.
- `src/textures.js` — all textures (brick, plaster, concrete, glass, asphalt…) are generated
  procedurally at start-up, with normal and roughness maps.
- `src/main.js` — renderer, sky and image-based lighting, shadows, post-processing
  (GTAO ambient occlusion, bloom, SMAA, vignette), controls, combat and camera.
