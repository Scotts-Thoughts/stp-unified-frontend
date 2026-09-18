# Input snapshot — legacy repos as found on 2026-09-10T18:17:26Z

Working trees under A:/Programs are the inputs. Scott committed the previously dirty `default_style_settings.js` files (and gen4's split CSVs) on 2026-09-10, so all five trees are clean and no file copies are needed; the earlier copies under `tools/inputs/<gen>/` were verified byte-identical to the commits and removed. Re-run this snapshot (`git status --short` per repo) whenever a phase starts; if a tree is dirty again, copy the dirty files here with their sha1 before running anything.

## gen1-stp-frontend

- HEAD: `996d031` on branch `2026-refactor-completion` — fixes (2026-09-10 11:30:19 -0600)
- working tree: clean
- `app/lib/default_style_settings.js` sha1 `n/a`

## gen2-stp-frontend

- HEAD: `d89003b` on branch `2026` — default styles (2026-09-10 12:11:55 -0600)
- working tree: clean
- `app/lib/default_style_settings.js` sha1 `f2a37062b8ea6d108ba0eac98dbdb16c6ec71468`

## gen3-stp-frontend

- HEAD: `d3b7648` on branch `main` — default styles (2026-09-10 12:13:19 -0600)
- working tree: clean
- `app/lib/default_style_settings.js` sha1 `a830582168ef6efeeb17f602b69ca49a3f2b2b65`

## gen4-stp-frontend

- HEAD: `7225a85` on branch `0.4.0` — default styles (2026-09-10 12:13:27 -0600)
- working tree: clean
- `app/lib/default_style_settings.js` sha1 `1fc527941e801b76cbf224904c4116905674827e`

## gen5-stp-frontend

- HEAD: `1d4e361` on branch `main` — default styles (2026-09-10 12:13:38 -0600)
- working tree: clean
- `app/lib/default_style_settings.js` sha1 `4c87f821a9c746e44debcfdb58e587d73fc3def5`

## Also captured

- keyhook.exe: `tools/inputs/keyhook.exe` copied from `A:/Programs/gen2-stp-frontend/keyhook.exe`, md5 `73db8f5278d94b21e6fc1beea09b144e` (identical in gen3; absent from gen1 HEAD)
- PokeAByte mappers: `%APPDATA%/PokeAByte/Mappers` HEAD `fe993a5` (github.com/PokeAByte/mappers)
- PokeAByte source: 0.11.2 (`A:/Programs/PokeAByte`)
- Queuer: `A:/Dropbox/stp-projects/programs/queuer` HEAD `1e4c2d6`

## Branch verification (2026-09-17)

Scott asked whether the lifts came from the intended branches: gen1 `2026-refactor-completion`, gen2 `2026`,
gen3 `main`, gen4 `0.4.0`, gen5 `main`. Verified against the code, not just this file:

- All five checkouts are still on those branches at the commits above (gen3/gen4 have only their
  `default_style_settings.js` dirty, which the legacy apps rewrite when run in dev mode).
- gen1: the pristine-copy commit `36b8bc1` is byte-identical to `996d031` for all 1,049 shared files except
  `.gitignore` and `src/renderer/.gitattributes` (the two documented edits); 124 more differ only in line
  endings (`* -text` vs gen1's `text=auto`). Against `2025-refactor` there are 49 real differences;
  `main`/`2025-restyle`/`abra` have a different tree layout (5 shared paths).
- gen2-5: for each lift commit (`3fc5c49` gen2/gen4, `6f367f1` gen3, `f9cb0fa` gen5), the `frontend.js`
  lines that exist only on the named branch (vs every sibling branch) are present in the lifted `Overlay.vue`
  at 78-97 %, and the lines that exist only on a sibling at 10-24 % (generic lines that also occur elsewhere).
  The named-branch lines not found are exactly the swapped infrastructure: control server, `MyStorage`/style
  manager, OBS socket, `logData`/`logCopy`, `require`/`localStorage`, and gen2's backport importer (decision 15).
