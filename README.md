# Solmar Heat

An original open-world crime game for the browser, built with three.js.
You are **Raka**, a courier in the coastal city of **Solmar**, taking jobs
from the harbour crews to the viewpoint of **Bukit Cemara** — one package
at a time, with the whole police force learning your name.

## What is in the game

- **Two districts, one city.** A downtown grid of avenues and streets
  with lit tower blocks, a working harbour (piers, container cranes,
  boats), an eastern airstrip, and the Bukit Cemara hill district with a
  climbing ramp road, villas, pine forest and a viewpoint over the bay.
- **On foot and by car.** Walk, run, steal any parked or stopped car and
  drive it with arcade physics — traffic, collisions and all.
- **Traffic and pedestrians.** Cars loop the road network and brake for
  each other; pedestrians stroll the sidewalks and flee gunfire.
- **Wanted system.** Crimes raise your stars. Police patrol cars hunt
  you, striped **roadblocks** appear from three stars, and a **helicopter
  with a searchlight** joins from four. Hide long enough and it fades.
- **Combat.** A pistol, tracers, hit sparks — and police who shoot back.
  Get cornered on foot and you are arrested; get shot down and you wake
  up at the clinic, poorer.
- **Seven story missions.** Delivery, a harbour checkpoint race, a car
  chase, a passenger run up the hill, a briefcase hunt, a roadblock
  escape, and one last package under a four-star sky.
- **HUD and minimap.** Objective with live distance, cash, wanted stars,
  game clock, health, speed, and a full-city minimap with blips for the
  objective, police, the helicopter and the mission thief.
- **Start screen, pause and saving.** Progress (cash, missions, health)
  is saved to localStorage automatically.
- **Generated sound.** Engine, siren, gunshots and jingles are
  synthesized with WebAudio — no audio files.
- **Deterministic world.** Every system runs on a seeded RNG; nothing in
  gameplay uses Math.random.

## Play it

```sh
node serve.ts          # then open http://localhost:8080
```

Any static file server pointed at `game/` works the same way.

| Keys | Action |
| --- | --- |
| W A S D / arrows | Walk / drive |
| E | Enter / leave a car |
| Mouse (hold) | Aim and shoot on foot |
| Mouse drag (right button, or in a car) | Orbit camera |
| Shift | Run / boost |
| Space | Handbrake |
| P / Esc | Pause (saves) |
| M | Mute |

## Screenshots and the dossier

The four screenshots in `screenshots/` are real renders of this game,
staged by `game/src/shots.js` and captured by:

```sh
node tools/shoot.mjs
```

The make.fun entrypoint copies `game/` and `screenshots/` to the output
directory and builds `dossier.json` with the kit's library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Source map

| File | Job |
| --- | --- |
| `game/src/main.js` | Boot, game loop, input, camera, crime, saving |
| `game/src/city.js` | Builds Solmar: roads, buildings, harbour, hill |
| `game/src/render.js` | Renderer, sky and the day-night cycle |
| `game/src/vehicles.js` | Car models and arcade vehicle physics |
| `game/src/traffic.js` | Traffic cars, parked cars, pedestrians |
| `game/src/player.js` | Raka on foot, entering cars, health |
| `game/src/police.js` | Wanted level, pursuit, roadblocks, helicopter |
| `game/src/missions.js` | The seven story missions |
| `game/src/combat.js` | Shooting, tracers, sparks, hit tests |
| `game/src/hud.js` | HUD panels and the minimap |
| `game/src/audio.js` | Synthesized sound effects |
| `game/src/shots.js` | Staging for the four screenshots |
| `game/src/config.js` | World layout and tuning constants |
| `game/src/random.js` | Seeded RNG (mulberry32) |

MIT licensed — see `LICENSE`. The vendored three.js build in
`game/vendor/` is MIT licensed by its authors; `vendor/makefun-game.ts`
is the make.fun kit's dossier library.
