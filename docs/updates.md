# Updates and releases

How a release is made, how the app updates itself, and how rollback works. The code:
`.github/workflows/release.yml`, `tools/build/after-pack.mjs` + `update-manifest.mjs`,
`tools/release/make-release.mjs`, `src/main/updater/`, `src/renderer/core/updates/`.

## Making a release

Push a commit to `main` whose **summary line** contains `vX.Y.Z` (e.g. `v3.3.0 faster splits`). The workflow:

1. finds the version (only in the *last* commit of the push; the `v` is required; a version already released is
   skipped with a warning);
2. on a Windows runner: `npm ci`, sets `package.json`'s version (not committed back), `npm run build`,
   `electron-builder --win` (afterPack writes the manifest), `make-release.mjs`;
3. creates the GitHub release `vX.Y.Z` as a **draft**, uploads everything, then publishes it. The commit message is the
   release notes. A half-uploaded release is never visible to the app.

Each release has: `manifest.json`, one file per pack, and `stp-overlay-X.Y.Z-win.zip` (the full download for new
users). Every release is self-contained (~2.6 GB of assets), so deleting an old release breaks nothing else.

Locally: `npm run build:win` then `npm run release:make` gives the same files in `dist/release/`.

## The manifest and packs

`resources/install-manifest.json` in every Windows build (written last by afterPack) lists every file: path, size,
SHA-256, pack, and offset in the pack. Packs (`update-manifest.mjs`, `packOf`):

| Pack | Holds | Stored |
|---|---|---|
| `runtime` | Electron: the exe, DLLs, `.pak`, locales | gzip |
| `app` | `resources/app` (code, data tables), `resources/image-copies.json`, `storage/` | gzip |
| `icons` | `resources/icons` | raw |
| `images-<folder>` | one per image folder; gens 2–5 one level deeper (`images-gen3-textures`) | raw |

A pack file is its files back to back in manifest order. Its asset name contains a hash of its file list, so an
unchanged pack has the same name in every release. Raw packs let the updater download single files with HTTP range
requests; gzip packs are downloaded whole when any file in them changed.

**The exe trap.** electron-builder writes the app version into the exe's version resource, so the 197 MB exe would
change in every release. `win.signAndEditExecutable` is `false`, and afterPack stamps the icon and names itself
(rcedit) with **Electron's** version. Checked 2026-10-28: two builds with different app versions gave a
byte-identical exe and runtime pack. Don't turn electron-builder's exe editing back on, and don't put the app version
into the exe.

## The updater (src/main/updater/)

On only in a packaged Windows build with an install manifest, and not when `STP_APP_ROOT` is set or
`STP_UPDATES=off` (the packaged probe sets it). Otherwise the Updates button is hidden and the window says why.

- **Start-up.** 5 s after launch it lists releases (GitHub API, unauthenticated, 60 checks/hour per IP;
  `STP_UPDATE_FEED` overrides the URL with any server answering the same JSON). If the newest is newer and not
  the user hasn't asked to be left alone about it, a native dialog asks: Update now / Remind me tomorrow / Skip this
  version / Never ask me. Native dialogs and the Updates window are separate windows, so OBS's window capture of the
  overlay never shows them.
- **The user's choices** (`<userData>/updates.json`, `UpdatePrefs`; Scott's rule: the user decides which version they
  run, and the app must never nag). `silenced` ("Never ask me", or the checkbox in the window): no start-up check at
  all, not even a request to GitHub. `skipped`: no question about that version or older; a newer one is asked about.
  `remindAfter` ("Remind me tomorrow", also what closing the dialog does): no question before the next local midnight.
  In all three cases `state.quiet` is true and the Updates button doesn't turn green. The Updates window shows and
  undoes all three, and always checks and installs whatever the user picks.
- **Download** (`download.ts`) into `updates/staging/`, only files the install lacks at that path with that content,
  each from the cheapest place: already staged (a stopped download resumes), the same content elsewhere in the
  install or in `updates/previous/` (copied), or the release. Every file is checked against its SHA-256.
- **Install** (`plan.ts` `planSwap`, `apply.ps1`). The app writes a tab-separated op list to `updates/ops.txt`, starts
  `apply.ps1` (hidden PowerShell), and quits. The script waits for the exe to close, then moves files: replaced or
  removed files to `updates/previous-new/`, staged files in, the manifest last, `previous-new` → `previous`. If
  anything fails before the `commit` line, every move is undone in reverse. Then it starts the app again and writes
  `updates/last-result.json` (the app shows a dialog on failure). Log: `updates/apply.log`.
- **Trap: starting the helper.** A detached child process is not enough on Windows. If the app runs inside a job
  object that kills its processes on exit and forbids breaking away (seen 2026-10-28 from a terminal; some
  launchers do it too), the helper dies with the app before it swaps anything. That leaves no `apply.log`, the
  app doesn't come back, and nothing is installed. `startHelper` has WMI (`Win32_Process.Create`) start the helper
  instead, which puts it outside any job, and falls back to a detached spawn.
- **Duplicate images.** The pool's duplicates are hard links made by `restoreImageCopies` (§2). Links to a file that
  changes would keep the old content, so the swap deletes the stale ones (`staleCopies`) and the next launch makes
  them again.
- **Rollback.** `updates/previous/` holds only the files the last swap replaced or removed, plus the old manifest.
  Rolling back is the same swap, staged from `previous/`, and leaves the newer version in `previous/`, so you can
  roll forward the same way. Only one previous version is kept. `Roll back to previous version.cmd` in `updates/`
  runs `apply.ps1` with `updates/rollback-ops.txt`. The app writes that file on every launch, and the swap writes it
  too, so it's ready even if the new version won't start.
- **Any version from GitHub.** The Updates window lists every release with a `manifest.json`, newer or older, and
  installs any of them the same way.

Never touched: `splits/`, `reports/`, anything else not in a manifest. A manifest path may not point into
`updates/`, `splits/` or `reports/`, or outside the folder (`parseManifest`).

## Limits

- Windows only. There is no Mac build. Running from source (`npm run dev`) never updates.
- Builds from before the updater (3.2.0 and older) have no manifest. Their users download one release by hand.
- The install folder must be writable. A copy under Program Files fails at the download step with a clear error.
- An update interrupted by a power cut mid-swap leaves `updates/previous-new/`. The app then refuses further
  updates and says to re-download the zip.

## Testing

- `npm run updates:selftest`: the swap through the real `apply.ps1` on a small fake install (update, rollback,
  roll forward, a failed swap undone).
- `npm run updates:e2e`: the real packaged app (`npm run build:unpack` first) against a local fake GitHub. It
  covers the start-up prompt, download sizes, rollback, reinstalling from `previous/`, a corrupted download, an
  older version from the list, and the `.cmd`'s op list. The app is kept off the network (dead memory-tool port,
  moved control port, clock off), and the copies `apply.ps1` restarts are killed.
- The GitHub workflow itself can only be tested by pushing a `vX.Y.Z` commit.
