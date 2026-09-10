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
const api = {
  settings_dir: () => ipcRenderer.invoke('settings_dir'),
  /** The folder `./splits` and `./storage` are resolved against (plan 1.7). */
  app_root: () => ipcRenderer.invoke('app_root'),

  splits: {
    write: (relative, contents, append = false) => ipcRenderer.invoke('splits:write', relative, contents, append),
    read: (relative) => ipcRenderer.invoke('splits:read', relative),
    exists: (relative) => ipcRenderer.invoke('splits:exists', relative),
    list: (relative) => ipcRenderer.invoke('splits:list', relative),
    copy: (from, to) => ipcRenderer.invoke('splits:copy', from, to),
    mkdir: (relative) => ipcRenderer.invoke('splits:mkdir', relative),
    reveal: (relative) => ipcRenderer.invoke('splits:reveal', relative),
  },

  data: {
    read: (relative) => ipcRenderer.invoke('data:read', relative),
    write: (relative, contents) => ipcRenderer.invoke('data:write', relative, contents),
    list: (relative) => ipcRenderer.invoke('data:list', relative),
  },

  storage: {
    read: (relative) => ipcRenderer.invoke('storage:read', relative),
    write: (relative, contents) => ipcRenderer.invoke('storage:write', relative, contents),
  },

  /** OBS WebSocket 5 auth string; the sha256 pair used to live in the renderer. */
  obsAuth: (password, salt, challenge) => ipcRenderer.invoke('obs:auth', password, salt, challenge),

  setGameIcon: (iconName) => ipcRenderer.invoke('set-game-icon', iconName),

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
