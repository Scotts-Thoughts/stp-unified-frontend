import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * The renderer's whole view of the main process.
 *
 * `settings_dir` is gen1's original channel and keeps its name and shape. Everything
 * else is new in the unified app: the file helpers replace `require("fs")` calls in the
 * renderer (plan 1.6), `onControlRequest` carries the queuer's control-server calls
 * (plan 1.8, docs/external-contracts.md section 2), and `shortcuts` carries the keyboard
 * shortcuts between the overlay, main's global shortcuts and the Keyboard Shortcuts
 * window (src/main/hotkeys.ts, docs/shortcuts-menu-plan.md).
 *
 * Every `on*` returns an unsubscribe function, because the renderer registers these
 * from component lifecycle hooks that run again after a hot reload.
 */
/**
 * Outstanding `invoke` calls.
 *
 * Every main-process call is real async, and the parity harness advances a *virtual*
 * clock; if a settings read resolves after the clock has moved, the overlay stamps a
 * timer or a saved file with a different time than it did on the previous run. The
 * counter lets the harness wait for the IPC boundary to be idle before it steps the
 * clock (docs/parity-harness.md section 9). It is a diagnostic only -- nothing in the
 * app reads it, and it costs one increment per call.
 */
let pendingInvokes = 0
const invoke = (channel, ...args) => {
  pendingInvokes++
  return ipcRenderer.invoke(channel, ...args).finally(() => {
    pendingInvokes--
  })
}

/**
 * Set when the Cutter editor started this overlay (src/main/cutter.ts): the
 * memory tool's address for this chain, which the renderer uses in place of
 * its constant. Passed on the renderer's command line, the only thing it has
 * before its first line runs.
 */
const cutterArg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : null
}

/**
 * The ordinary app's own override of the memory tool's address -- unrelated to
 * `--cutter-tool`, which only exists on a chain the Cutter editor started. Either the
 * `STP_TOOL_URL` environment variable or a `--tool-url=<url>` command-line switch (the
 * flag wins when both are set); null when neither is, which keeps `main.ts`'s default
 * (`http://localhost:8085`). This is how someone runs the overlay against a local
 * GameHook instance, or a non-default PokeAByte port, without touching the source.
 */
const toolUrlOverride = cutterArg('tool-url') ?? process.env.STP_TOOL_URL ?? null

const api = {
  /** Number of main-process calls still in flight; see `pendingInvokes`. */
  __pendingIpc: () => pendingInvokes,

  /** `{ toolUrl }` when the Cutter editor runs this overlay, otherwise null. */
  cutter: cutterArg('cutter-tool') ? { toolUrl: cutterArg('cutter-tool') } : null,

  /** The ordinary-mode memory tool override, or null; see `toolUrlOverride`. */
  toolUrl: toolUrlOverride,

  /** Where main serves the out-of-process clock page (core/overlay/ClockFrame.ts), or null when it is off. */
  timerFrameUrl: cutterArg('timer-frame-url'),

  settings_dir: () => invoke('settings_dir'),
  /** The folder `./splits` and `./storage` are resolved against (plan 1.7). */
  app_root: () => invoke('app_root'),
  /** `app.isPackaged`; the legacy style managers' dev/prod switch (core/env.ts). */
  is_packaged: () => invoke('is_packaged'),
  /** Taskbar icon: a file under resources/icons/, or "" for the portrait. Fire and forget. */
  set_game_icon: (relative) => ipcRenderer.send('set-game-icon', relative),
  /** gen5's second-screen key sender (node-key-sender in the main process, decision 9). Fire and forget. */
  send_virtual_key: (keyName) => ipcRenderer.send('send-virtual-key', keyName),

  splits: {
    write: (relative, contents, append = false) => invoke('splits:write', relative, contents, append),
    read: (relative) => invoke('splits:read', relative),
    exists: (relative) => invoke('splits:exists', relative),
    list: (relative) => invoke('splits:list', relative),
    copy: (from, to) => invoke('splits:copy', from, to),
    mkdir: (relative) => invoke('splits:mkdir', relative),
    reveal: (relative) => invoke('splits:reveal', relative),
    /** A file dialog for the split comparison (.replay or .csv); null when cancelled. */
    pickComparison: () => invoke('splits:pick-comparison'),
    /** The split comparison in the file at `file` (the queuer's route uses the same loader in main). */
    loadComparison: (file) => invoke('splits:load-comparison', file),
  },

  data: {
    read: (relative) => invoke('data:read', relative),
    write: (relative, contents) => invoke('data:write', relative, contents),
    list: (relative) => invoke('data:list', relative),
  },

  storage: {
    read: (relative) => invoke('storage:read', relative),
    write: (relative, contents) => invoke('storage:write', relative, contents),
  },

  /** Dev-mode writes back into `src/renderer/**`, so edited defaults land in git. */
  source: {
    write: (relative, contents) => invoke('source:write', relative, contents),
  },

  /** OBS WebSocket 5 auth string; the sha256 pair used to live in the renderer. */
  obsAuth: (password, salt, challenge) => invoke('obs:auth', password, salt, challenge),

  /**
   * Control-server requests from the queuer. The handler returns the JSON body; the
   * reply id has to come back even on failure or the server answers with a timeout.
   */
  onControlRequest: (handler) => {
    const listener = async (_event, request) => {
      let reply
      try {
        reply = await handler(request.route, request.query)
      } catch (error) {
        reply = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      ipcRenderer.send('control-reply', { id: request.id, reply: reply ?? { ok: false, error: 'no reply' } })
    }
    ipcRenderer.on('control-request', listener)
    return () => ipcRenderer.removeListener('control-request', listener)
  },

  /**
   * Keyboard shortcuts (src/main/hotkeys.ts). Fire-and-forget sends rather than
   * `invoke`, so the parity harness's idle counter never waits on them.
   */
  shortcuts: {
    /** Overlay: register exactly these accelerators as global shortcuts. */
    register: (accelerators) => ipcRenderer.send('hotkeys:set', accelerators),
    /** Overlay: a registered accelerator was pressed. */
    onPressed: (handler) => {
      const listener = (_event, accelerator) => handler(accelerator)
      ipcRenderer.on('hotkeys:pressed', listener)
      return () => ipcRenderer.removeListener('hotkeys:pressed', listener)
    },
    /** Overlay: the active generation's actions and bindings, for the window. */
    publishCatalog: (catalog) => ipcRenderer.send('shortcuts:catalog', catalog),
    /** Overlay: an edit made in the window. */
    onEdit: (handler) => {
      const listener = (_event, edit) => handler(edit)
      ipcRenderer.on('shortcuts:edit', listener)
      return () => ipcRenderer.removeListener('shortcuts:edit', listener)
    },
    /** Overlay: the window wants a fresh catalog. */
    onRefresh: (handler) => {
      const listener = () => handler()
      ipcRenderer.on('shortcuts:refresh', listener)
      return () => ipcRenderer.removeListener('shortcuts:refresh', listener)
    },
    /** Either window: open (or focus) the Keyboard Shortcuts window. */
    openMenu: () => ipcRenderer.send('shortcuts:open-menu'),
    /** Window: the catalog main has, or null before any generation published one. */
    getCatalog: () => ipcRenderer.invoke('shortcuts:get-catalog'),
    /** Window: each catalog the overlay publishes. */
    onCatalog: (handler) => {
      const listener = (_event, catalog) => handler(catalog)
      ipcRenderer.on('shortcuts:catalog', listener)
      return () => ipcRenderer.removeListener('shortcuts:catalog', listener)
    },
    /** Window: send an edit to the overlay. */
    edit: (edit) => ipcRenderer.send('shortcuts:edit', edit),
    /** Window: ask the overlay to publish again. */
    refresh: () => ipcRenderer.send('shortcuts:refresh'),
    /** Window: unregister every shortcut while a key is recorded, then put them back. */
    suspend: () => ipcRenderer.send('hotkeys:suspend'),
    resume: () => ipcRenderer.send('hotkeys:resume'),
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
