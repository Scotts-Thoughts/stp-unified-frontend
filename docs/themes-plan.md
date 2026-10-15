# Themes: implementation plan

Status: **proposed, 2026-10-09. Not approved, nothing built.**

## 1. Goal

A *theme* changes how a generation's overlay looks, never what it does. The timer still counts the same way
wherever a theme puts it, a split CSV is byte-identical under every theme, and markers, `/status` and saved
settings don't depend on the theme.

Each generation picks its theme on its own, so Scott can build a modern look for new videos and keep the current
one for old series. Other people can make their own themes without rebuilding the app.

**"Classic" is today's look,** and it is the default. It is an empty theme: nothing is added, so it stays pixel-
identical to the overlay before this feature. The harness proves that (§8).

The starting reference is the mockup a friend sent (a modern, dark, card-based gen2 layout). Two things in it are
**not** theme work:

- **The "Wild Pokémon on <route>" panel** with encounter rates and caught markers. No generation shows this
  today. It is new functionality and needs its own plan and data.
- **Any new numbers or labels** the overlay doesn't already compute.

## 2. How the visuals are built today (the constraints)

What a theme has to work with, from a survey on 2026-10-09:

- **Fixed canvas.** Every generation is a 1920×1080 page of absolutely positioned elements, from 92 (gen1) to
  219 (gen3) `position: absolute` rules each. `games/genN/style.css` is scoped under `.gen-N` and injected by
  `applyModuleStyles` in `src/renderer/main.ts` as `<style id="stp-gen-style">`.
- **Panel frames are full-canvas pictures.** A `.colored-image`/`.tinted-box` layer is a whole 1920×1080 SVG
  (`--url: url(images/genN/ui/....svg)`), tinted with `--overlay-color` through a mask. **Moving an element
  doesn't move its painted frame.** A theme that rearranges things has to hide those layers and draw its own
  per-box backgrounds in CSS.
- **Image paths are in the templates.** gen2–5's overlays name `images/...` about 80–190 times each, often built
  in JS (`` `images/gen2/type-icons/${ui_type_icons_modifier}${type}.webp` ``). The stylesheets have only 6–10
  `url()`s. Editing every path in the four lifted overlays is not an option, so images are swapped below the
  page instead (§4.3).
- **How `images/` resolves.**
  - Dev server: `http://localhost:<port>/images/...`, served by Vite from `src/renderer/public/images`.
  - Built: `file:///.../out/renderer/images/...`, a junction made by `electron.vite.config.js`.
  - Packaged: the same junction to `resources/images`, made by `ensureImagePool()` in `src/main/importLegacy.ts`.
- **Per-species styling stays.** `overlay_color`, `backgroundTexture`, `backgroundHue` and the rest
  (`games/genN/data/style/*.json` and the user's overrides) keep working under every theme. A theme decides
  whether to use them: it can read `var(--overlay-color)` or ignore it.
- **Existing style switches.** gen2–5 already have `ui_type_icons` / `ui_type_icons_modifier` (2024 icons or
  legacy) and `ui_stats_styling` (2023/2024). These are early themes in all but name. They keep working, and a
  theme can target either variant.
- **The clock runs in its own process.** `core/overlay/ClockFrame.ts` overlays an `<iframe>` showing
  `src/main/timer-frame.html` from `127.0.0.1:30160`. The frame's box is the `.gen-N .gametimeFrame` rule; the
  page holds its own copy of each generation's `.gametime*` geometry and fonts. A theme that moves or restyles
  the clock has to reach both the overlay's markup and that page.
- **The contract that helps us.** CSS classes and element ids may not be renamed (AGENTS.md, ARCHITECTURE §10).
  That makes them a stable surface for theme stylesheets to target.

## 3. What a theme is

A folder, containing **no code**: CSS, images, fonts and one JSON file. User themes can't run JavaScript, which
keeps sharing a theme safe.

```
themes/<id>/
  theme.json          name, author, version, which generations it supports
  common.css          optional: applied to every supported generation
  gen1.css … gen5.css optional: one per generation; selectors start with .gen-N like the shipped sheets
  clock.css           optional: injected into the clock frame page (§4.5)
  images/             optional: mirrors src/renderer/public/images, e.g. images/gen2/type-icons/2024/fire.webp
  fonts/              optional: referenced from the theme's CSS
```

`theme.json`:

```json
{
  "format": 1,
  "id": "modern",
  "name": "Modern",
  "author": "Scott's Thoughts",
  "generations": [2],
  "description": "Dark cards, compact clock, pill type badges."
}
```

**Where themes live:**
- **Built-in:** `themes/` at the repo root. Shipped with `extraResources` (`resources/themes`) next to the image
  pool.
- **User themes:** `<userData>/stp-overlay/themes/`. A user theme whose id matches a built-in one is skipped,
  with a log line.

**Referring to the theme's own files from its CSS.** A `<style>` element resolves relative `url()`s against the
document, not the theme folder. Theme CSS is therefore rewritten at load time: `url(fonts/x.woff2)` and
`url(images/...)` *inside the theme folder* become `stp-theme://<id>/fonts/x.woff2`. Plain `images/...` paths
that aren't in the theme keep resolving to the shared pool as they do now. Remote `http(s)` URLs in theme CSS are
refused (§4.1), so a shared theme can't fetch from the internet.

## 4. Mechanisms

### 4.1 Main process: theme index, `stp-theme://` protocol, image redirect

New file `src/main/themes.ts`:

- `themeRoots()`: the built-in folder (`<appRoot>/themes` in dev, `process.resourcesPath/themes` packaged) and
  `<userData>/stp-overlay/themes`. Uses `paths.ts`; every file access goes through `resolveInside()`.
- `listThemes()`: reads each `theme.json` and validates it (unknown `format`, a bad id or a missing name means the
  theme is skipped with a log line).
- **The index.** When a theme becomes active, its folder is scanned once into a `Set` of relative paths under
  `images/`, so deciding whether to redirect is a set lookup and never touches the disk per request.
- **The `stp-theme` scheme.** `protocol.registerSchemesAsPrivileged` (before `app.whenReady`) with
  `standard`, `secure`, `supportFetchAPI` and `corsEnabled`, then `protocol.handle("stp-theme", ...)`. It serves
  files from the theme folders and adds `Access-Control-Allow-Origin: *`. CSS mask images and web fonts are
  fetched in CORS mode, and the panels are drawn with masks, so without that header they would fail silently.
- **The image redirect.** `session.defaultSession.webRequest.onBeforeRequest`, filtered to `*/images/*`. If the
  active theme for the page's generation has that path, it redirects to `stp-theme://<id>/images/...`; otherwise
  the request goes through untouched. With Classic active, the handler is not installed at all.
  - `src/main/cutter.ts` already redirects requests through `onBeforeRequest` (the emulator address). Electron
    keeps **one** `onBeforeRequest` listener per session; registering a second replaces the first. The two never run in the same process (cutter mode
    replaces the normal boot), but say so in a comment and keep it that way.
- **Refusing remote URLs.** The redirect handler also cancels `http(s)` requests whose referrer is a theme
  stylesheet. Low priority; it can follow later.
- **IPC** (in `ipc.ts`, through `preload` / `index.d.ts`): `themes:list` → `ThemeInfo[]`;
  `themes:activate (gen, id)` → `{ css: Record<string,string>, clockCss: string | null }`, with the CSS already
  rewritten (§3). Activating builds the index and switches the redirect.

**Spike first (half a day): does `onBeforeRequest` fire for `file://` requests in a built app?** It does in dev
(`http://localhost`). If it doesn't for `file://`, the fallback is to load the built renderer from a custom
`app://` scheme instead of `loadFile`, so every request passes through a handler we own. That is a bigger
change: it alters the document origin, which the clock frame's `targetOrigin` and every relative URL depend on.
Find out before committing to anything else.

### 4.2 Renderer: theme slot and active theme

New folder `src/renderer/core/theme/`. It goes in `core/`, so it never imports from `games/`.

- `themeState.ts`: which theme each generation uses. Saved with `getUserState("ui_theme", "classic", "genN")` /
  `setUserState`, so it lives in that generation's section of `user_state.json`. It's a new key, so nothing is
  renamed. Built directly on `userState`, not `MyStorage`, so gen2–5's style-key rules never see it.
- `applyThemeStyles(gen)`: puts `<style id="stp-theme-style">` **after** `stp-gen-style`, then waits for the
  theme's `@font-face` families, just as `applyModuleStyles` does for the gen sheet.
- `src/renderer/main.ts`: `applyModuleStyles` calls it under the same `styleSequence` guard, so a quick mapper
  switch can't leave one generation's theme over another generation's sheet. On unload (back to `GameSelect`
  and gen1 styling) the theme slot is emptied.
- Classic means no IPC call, an empty `stp-theme-style` and no redirect: the page is the same as before.

### 4.3 Images

Nothing in the templates changes. A theme replaces a file by shipping the same relative path under its `images/`
folder, and the redirect (§4.1) does the rest. Examples:

| To change | Theme file |
|---|---|
| gen2 type icons (2024 set) | `images/gen2/type-icons/2024/<type>.webp` |
| gen2 background textures | `images/gen2/textures/<name>.webp` |
| gen2 exp bar art | `images/gen2/exp_bar/...` |
| gen2 panel frames | `images/gen2/ui/<panel>.svg` (or hide them in CSS, §5) |

**Caching.** Chromium caches images by URL. If the theme changed mid-session, a cached `images/...` would keep
its old picture. Switching themes therefore **reloads the window** (`webContents.reload()`, the same thing as the
`/reload` route) after saving the choice. Reloading is already a supported operation; the overlay's state is in
files.

New images are WebP like the pool (`tools/assets/to-webp.ts`); icons may stay PNG (see the WebP notes in
`docs/IMPLEMENTATION_PLAN.md`).

### 4.4 Settings: the picker

- **gen2–5:** one row, `Theme:` with a `<select>`, in each overlay's settings table, next to the existing
  advanced-settings rows. The row is one shared component, `core/overlay/ThemePicker.vue`, taking a `gen` prop,
  so the four overlays each gain one line of template and no methods. `parity:drift` compares methods, so it is
  unaffected. Run it anyway.
- **gen1:** the same component in one of `components/settings/interface_*.vue`.
- Changing the selection saves `ui_theme`, flushes user state (`flushUserState()`), then reloads (§4.3).
- No theme is ever written at mount time. A mount-time write shows up in the harness as a saved-state
  difference.

**Control route, later:** `/theme?gen=2&id=modern` for switching from the recording queuer. Not in step 1; it is
an external contract (`docs/external-contracts.md`) and needs its own entry.

### 4.5 The clock frame

- `ClockFrame.ts` already posts `{ type: "overlay-timer", state }` to the frame. Add one message,
  `{ type: "overlay-theme", css }`, sent on load and on frame reload, carrying the theme's `clock.css`
  (or an empty string).
- `timer-frame.html` puts that text in a `<style id="theme">` after its own rules. Its fonts load over
  `stp-theme://`, which works from the frame's `127.0.0.1:30160` origin because of the CORS header (§4.1).
- **Moving the clock takes two edits in a theme:** the overlay's `.gen-N .gametimeFrame` box (and the hidden
  `.gametime*` markup under it, for runs without the frame) in `genN.css`, and the inside of the frame in
  `clock.css`. The authoring guide spells this out with an example.
- The harness runs with `STP_TIMER_FRAME=off`, so it checks only the overlay's own clock. The frame needs a
  manual look, or the Mac's frozen-page check from ARCHITECTURE §4.

### 4.6 Forcing a theme for tests

`STP_THEME=<id>` (environment) makes every generation that the theme supports use it, ignoring the saved
choice, and never writes `ui_theme`. Unset, the harness runs on its fresh user state, so it gets Classic. This
lets the harness capture a theme's own baseline (§8).

## 5. Writing a theme: what it can and can't do

The authoring guide goes in `docs/themes.md` and is written in step 1. It is meant for other users too, so it
explains in plain language:

- **Can:** move, resize, hide or recolour any element with a class or id; replace any image in the pool; swap
  fonts; restyle bars, badges and panels; use the per-species `--overlay-color` or ignore it; target the existing
  `ui_type_icons` / `ui_stats_styling` variants.
- **Can't:** add information the overlay doesn't compute, change a timer, split, marker or hotkey, or reorder
  elements that a theme can only reach through their position in the page.
- **The panel-frame trap.** To move a box, also hide its painted frame (`.gen-N .colored-image[...]`) and give
  the box its own background.
- **Selector reference.** A list per generation of the useful classes and ids (clock, party, moves, stats, exp
  bar, HP bar, type icons, badges, texture), generated from the stylesheets with a small script
  (`tools/themes/selectors.ts`) rather than written by hand, so it can be re-run.

## 6. Steps

Each step ends with a stop for Scott to review and commit (AGENTS.md: no commits by the agent).

### Step 0: spike (½ day)
`onBeforeRequest` on `file://` in a built app, and a masked SVG loaded through `stp-theme://` with the CORS
header. Throwaway code; report back before step 1.

### Step 1: the foundation (2–3 days, one commit)
1. `src/main/themes.ts`, the protocol, redirect, IPC; `preload` + `index.d.ts`; `extraResources` entry for
   `themes/`.
2. `core/theme/` and the `applyModuleStyles` hook.
3. `ThemePicker.vue` in all five settings panels.
4. The clock-frame message.
5. `STP_THEME`.
6. A small built-in **`example`** theme, available in dev builds only. It moves gen2's clock to the right and
   swaps the gen2 fire type icon. It proves the CSS layer, the image redirect and the clock frame, and doubles as
   the template for user themes.
7. Docs: `docs/themes.md` (authoring), a "Themes" paragraph in ARCHITECTURE §2/§3 and a row in §13, and this
   file marked done.

### Step 2: the "Modern" theme for gen2 (several sessions, one commit per sitting)
Built from the mockup, CSS and images only:
1. Hide the full-canvas panel art and give each box its own card (rounded, dark, subtle border).
2. The clock: compact `3h 44m 23s 100ms` style, top left (both halves, §4.5).
3. Badges row, species art card, name/level/type pill, HP and exp bars.
4. Move list and stat tiles with coloured left borders.
5. Fonts: pick an openly licensed face (SIL OFL) that matches the mockup, and ship it in the theme.

Whatever CSS alone can't reach goes into a list for step 3, with the reason.

**A class added for a theme.** Adding a class to an element (never renaming one) is allowed when the harness
shows no difference under Classic. Each addition is noted in `docs/themes.md`. A wrapper element is *not*
allowed in step 2: it changes the layout oracle and the structure Phase 6 is decomposing.

### Step 3: swappable pieces (after Phase 6 reaches the area)
Some changes need different markup, such as the mockup's party row with small HP bars. Once Phase 6 has turned
an area into components, a generation can offer **built-in variants** of that component (for example
`ClockCompact.vue` next to the classic clock). A theme picks one in `theme.json`:

```json
"variants": { "gen2": { "clock": "compact" } }
```

Variants are written in the repo and reviewed; a user theme can only choose among them, so themes still carry
no code. gen1 is already componentised and can get this first. This step follows the Phase 6 rules: a move and a
rewrite never share a commit, and a variant is a component, not an `if (gen === …)` in `core/`.

### Step 4: Modern for other generations
The same pattern for gen4/gen5/gen3/gen1, in whatever order Scott records next.

## 7. Rules this plan keeps

- **Decision 26 (a guideline since 2026-10-14).** It used to keep Classic per generation and untouched. Classic
  itself may now grow more uniform through the UI-uniformity work (`docs/ui-uniformity-plan.md`); Classic is
  simply the shipped look at the time. A theme is still a separate, opt-in layer on top of it.
- **§4 CSS rules.** The shipped `style.css` files aren't edited for themes; theme CSS is a separate layer on top.
- **Invariants (ARCHITECTURE §10).** No renames; no `localStorage` (the choice is in `user_state.json`);
  `core/theme` never imports `games/`; the renderer gets files only through `window.api` and `stp-theme://`.
- **Phase 6 gains one duty.** Once a built-in theme exists, a Phase 6 slice must also leave that theme unchanged.
  Run the harness with `STP_THEME=modern` for that generation, as well as with Classic.

## 8. Verification

| Check | When |
|---|---|
| `npm run typecheck` | Every step |
| `npm run parity:drift` | Any step that touches gen2–5 overlays (step 1's picker row) |
| `npm run build` | Every step. The main-process code (`themes.ts`, protocol, IPC) has **no typecheck** (ARCHITECTURE §12), so the build only catches syntax and imports. Say so when reporting |
| **Harness, all five generations, Classic**, against a HEAD-worktree baseline | Step 1. Expected difference: the new picker row in each settings panel and nothing else, in pixels and layout only. No differences in saved state, writes, splits or markers |
| Harness with `STP_THEME=example` | Step 1: the clock moved and the fire icon replaced, and every non-visual oracle identical to Classic |
| Harness with `STP_THEME=modern`, gen2 | Step 2. Its captures become the theme's own baseline; non-visual oracles identical to Classic |
| Packaged build, manual: pick a user theme from `<userData>/stp-overlay/themes` | Step 1, Windows (`packaged:probe` only runs there) |
| Clock frame, manual (the harness turns it off) | Steps 1 and 2 |

gen2 has no committed harness fixture (ARCHITECTURE §12); its real recording is in the gitignored
`tools/fixtures/raw/`, so step 2's gen2 harness runs need the Windows machine or a copy of that file.

## 9. Open questions for Scott

1. **Is a reload on theme switch acceptable?** Recommended: yes. The alternative, live switching, means fighting
   the image cache.
2. **Built-in themes in packaged builds:** ship `example`, or keep it dev-only? Recommended: dev-only, and point
   other users at `docs/themes.md`.
3. **Fonts for Modern:** do you have a face in mind from the mockup? If not, step 2 proposes two OFL candidates
   with screenshots.
4. **The wild-encounter panel:** a separate feature plan, if you want it.
