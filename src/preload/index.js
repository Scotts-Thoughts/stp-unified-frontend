import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * The renderer's whole view of the main process.
 *
 * `settings_dir` is gen1's original channel and keeps its name and shape. Everything
 * else is new in the unified app: the file helpers replace `require("fs")` calls in the
 * renderer (plan 1.6), `onControlRequest` carries the queuer's control-server calls
 * (plan 1.8, docs/external-contracts.md section 2), and `onKeyEvent` carries decoded
 * keyhook.exe output (plan 1.1).
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

const api = {
  /** Number of main-process calls still in flight; see `pendingInvokes`. */
  __pendingIpc: () => pendingInvokes,

  settings_dir: () => invoke('settings_dir'),
  /** The folder `./splits` and `./storage` are resolved against (plan 1.7). */
  app_root: () => invoke('app_root'),
  /** `app.isPackaged`; the legacy style managers' dev/prod switch (core/env.ts). */
  is_packaged: () => invoke('is_packaged'),
  /** Taskbar/window icon: a file under resources/icons/ (gen3/4/5's `set-game-icon`). Fire and forget, as it was. */
  set_game_icon: (relative) => ipcRenderer.send('set-game-icon', relative),

  splits: {
    write: (relative, contents, append = false) => invoke('splits:write', relative, contents, append),
    read: (relative) => invoke('splits:read', relative),
    exists: (relative) => invoke('splits:exists', relative),
    list: (relative) => invoke('splits:list', relative),
    copy: (from, to) => invoke('splits:copy', from, to),
    mkdir: (relative) => invoke('splits:mkdir', relative),
    reveal: (relative) => invoke('splits:reveal', relative),
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

  setGameIcon: (iconName) => invoke('set-game-icon', iconName),

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

  /** Decoded keyhook.exe events: `{ down, keyCode, time }`. */
  onKeyEvent: (handler) => {
    const listener = (_event, key) => handler(key)
    ipcRenderer.on('keyhook:key', listener)
    return () => ipcRenderer.removeListener('keyhook:key', listener)
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
