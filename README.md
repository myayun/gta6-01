# Solmar Bay — A Solmar Bay Story

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/myayun/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/myayun/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar Bay** is an original open-world crime game for the make.fun "Make GTA 6"
bounty: a sun-soaked coastal city you explore on foot and by car, with traffic,
pedestrians, a wanted level and police, three story missions, combat, and a HUD
with a live minimap. Built with three.js (vendored) and a small Rust→WebAssembly
traffic module. Everything — the city, the characters, the vehicles, the story,
the art and the music — is invented for this game.

## Play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

No network is needed: every file the game loads lives under `game/`.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive |
| Shift | Run |
| Mouse | Orbit camera (click the game to lock the pointer) |
| E | Enter / exit a car (steal parked and traffic cars) |
| Click | Shoot the pistol |
| Space | Jump |
| P / Esc | Pause |
| M | Mute |
| R | Get back up after WASTED / BUSTED |

## The story

Mara Voss is back in the city that made her. Dante Reyes has a job lined up —
three scores, one payday, and the whole Solmar Bay PD in the way:

1. **First Wheels** — steal the red Viento GT and bring it to Dante's garage.
2. **Bayfront Drop** — run a package to the marina in 90 seconds, with the
   police already on you.
3. **The Solmar Job** — take the cash from Solmar Bank and escape a three-star
   chase to the hideout.

Progress saves automatically (localStorage). Wanted stars rise with every
crime and fall when you stay quiet and out of sight.

## Layout

- `game/index.html` — the page, with an import map for the vendored three.js
- `game/src/` — the game's own source, one file per job: `main.js` (boot and
  loop), `world.js` (city generation), `render.js` (three.js scene and
  cameras), `player.js`, `vehicles.js` (driving + traffic), `traffic-wasm.js`,
  `police.js` (wanted level + pursuit), `peds.js`, `combat.js`, `missions.js`,
  `hud.js` (HUD + minimap), `audio.js` (synthesized sound), `shots.js`
  (deterministic screenshot scenes), `input.js`, `config.js`, `random.js`
- `game/rust/traffic.rs` — the traffic integrator, compiled to
  `game/vendor/traffic.wasm` (a JS twin runs if the module cannot load)
- `game/vendor/three.module.min.js` — three.js 0.160.0, vendored
- `screenshots/` — four real renders of the game's own code
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output`
  and writes the dossier

## License

MIT — see `LICENSE`.
