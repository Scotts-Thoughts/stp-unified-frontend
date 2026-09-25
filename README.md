# STP overlay (unified)

One Electron app that plays the five Scott's Thoughts Pokémon overlays -- gen1 (Yellow, Red & Blue),
gen2 (Crystal, Gold & Silver), gen3 (Emerald, FireRed & LeafGreen), gen4 (Platinum, Diamond & Pearl,
HeartGold & SoulSilver) and gen5 (Black, White, Black 2, White 2) -- picking the generation from the
mapper PokeAByte has loaded. The migration is documented in `docs/IMPLEMENTATION_PLAN.md`; the parts of
it that are "why", not "what", are in the section headers of the source files themselves.

## Run it

1. `npm ci`
2. `npm run dev` -- the overlay opens and waits for PokeAByte (`http://localhost:8085`) to load a mapper.
   Code changes apply to the running app.
3. `npm run build` -- the packaged-shape build in `out/`; `npm run build:unpack` wraps it with electron-builder
   into `dist/win-unpacked/` (3.0 GB, the image pool included) and `npm run packaged:probe` launches that exe
   with the network blocked and checks it found everything; `npm run build:win` zips the same tree.

The recording queuer launches the app with `npm run dev` and drives it over `http://127.0.0.1:30159`
(`docs/external-contracts.md` says exactly what it sends and expects; `docs/queuer-unified.patch` is the
queuer-side change). Super Shuckie (`http://127.0.0.1:30158`) and OBS (`ws://localhost:4455`) are optional.

## How it is put together

```
src/main            Electron main process: the window, the control server (30159), the keyhook.exe
                    forwarder, the file IPC (splits, user data, shipped defaults, dev-mode source writes)
src/preload         the renderer's whole view of the main process (`window.api`)
src/renderer
  core/             what every generation shares: the mapper profile/adapter layer, the file-backed
                    user state and layered style store, the OBS client, hotkeys, the control-server
                    bridge, the fit-to-window scaling, the base stylesheet
  games/genN/       one folder per generation: `manifest.ts` (what the shell knows before loading it:
                    mapper profiles, editions), `index.ts` (the GameModule), the overlay, its data,
                    stylesheet, storage rules, hotkeys, control routes, split-file writers
  components/, stores/, logic/, autosplitter/, data/
                    gen1's own code (the refactored generation; the others are lifted, see below)
  public/images/    the image pool: gen1's files at the root, each other generation's tree under
                    `images/genN/`; lossless WebP where the legacy apps had PNG (a new PNG goes
                    through `tools/assets/to-webp.ts`), JPEG and SVG as they were
  fonts/
tools/parity        the parity harness: a mock PokeAByte, the replay runner, nine oracles
tools/port          the port/lift tooling that produced games/gen2-5 from the legacy apps
tools/assets        the image-pool manifest and merge, the PNG -> WebP conversion and its checks
tools/splits        the one-time consolidation of the legacy splits trees
docs/               the plan, the external contracts, the harness, the per-generation mapper
                    inventories, the known legacy bugs (preserved on purpose)
```

**gen1 is refactored code** (Vue SFCs, Pinia stores). **gen2-5 are lifted**: each `games/genN/Overlay.vue`
is the legacy app's component object and template brought in verbatim with only the infrastructure
swapped for `core/` (`tools/port/lift-genN.py` lists every seam). Decomposing them into the shared
stores is Phase 6 of `docs/IMPLEMENTATION_PLAN.md` (its status table is section 7g; the detailed plan is the
last section), done with the harness as the net.

Boot: the shell connects the one mapper client, `games/registry.ts` matches the loaded mapper to a
generation's profile, the generation's module is imported on demand, its stylesheet is applied under
`.gen-N`, and its overlay mounts. Unloading the mapper returns to the box-art game-select screen.

## Adding or changing a game

- A new mapper for an existing generation: add a `MapperProfile` under `games/genN/mappers/` (the path
  patterns, the identity rule, the read and write tables) and list it in the generation's `manifest.ts`.
- A new edition: an entry in the manifest's `editions` (name, mapper game, box art, split folder, icon).
- Anything that changes what the overlay renders or writes: run the harness before and after.

## The parity harness

`docs/parity-harness.md` is the reference. The short version:

```
npm run parity:all                                         # every fixture vs its baseline, one line each
npm run parity:all -- --only=gen3                          # a subset
npm run parity:all -- --baselines [--gen1-worktree=<dir>]  # (re)capture the legacy baselines
```

and, one run at a time:

```
npm run parity:preflight                                   # who holds the ports
npx tsx tools/parity/run.ts unified <fixture> --out=tools/reports/<name> --redirect-ports --control
npx tsx tools/parity/run.ts legacy:gen3@37 <fixture> --out=tools/reports/<name> --redirect-ports --control
npx tsx tools/parity/diff.ts tools/reports/<legacy> tools/reports/<unified>
```

`--redirect-ports` keeps the run off the ports a live PokeAByte, Super Shuckie, OBS or overlay hold;
`--control` adds the queuer's control-server session for one queue item (oracle 6). Baselines are local
(`tools/baselines/`, gitignored): gen2-5's come from the legacy apps in their sandboxes, gen1's from this app
at the previous commit (a built `git worktree`), since no legacy gen1 can be driven.

A fixture is a recording of PokeAByte's property stream (`tools/fixtures/`, made by the queuer's Capture
Fixtures mode) or a synthetic one built from a mapper XML and a scenario (`tools/parity/make-fixture.ts`,
`tools/parity/scenarios/`). The runner replays it into the app under a virtual clock and captures each
checkpoint; the diff compares layout, pixels, split CSVs, persisted state, PokeAByte writes, OBS markers,
Super Shuckie calls and console errors. `unified@<dir>` runs a built worktree of another commit with the
same harness, which is how a refactor is shown not to change gen1.

## Where the app keeps things

- User state (what the legacy apps kept in `localStorage`): `%APPDATA%/stp-overlay/data/user_state.json`,
  one section per generation plus a global one, same key names. On first launch each section is seeded
  from the legacy app's own profile (`%APPDATA%/<legacy app>/Local Storage/leveldb`, read from a copy);
  `npm run import:dump <profile folder>` shows what that takes.
- gen1's per-species settings and metrics: `%APPDATA%/stp-overlay/data/<game>/<species>/`.
- Shipped style defaults: `games/genN/data/style/<Game>_<Species>.json` (a dev-mode edit writes the file).
- Split CSVs: `splits/` next to the app (the five legacy trees consolidated, every folder name kept).
