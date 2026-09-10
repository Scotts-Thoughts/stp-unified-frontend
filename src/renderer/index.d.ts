import { ElectronAPI } from '@electron-toolkit/preload'

/** One entry of a directory listing returned by the splits/data IPC helpers. */
export interface DirectoryEntry {
  name: string
  directory: boolean
}

/** What the control server sends the renderer for one queuer call. */
export type ControlHandler = (
  route: string,
  query: Record<string, string>,
) => Promise<Record<string, unknown>> | Record<string, unknown>

export interface KeyEvent {
  down: boolean
  keyCode: number
  time: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      /** Outstanding main-process calls; used by the parity harness, not by the app. */
      __pendingIpc: () => number,
      settings_dir: () => Promise<string>,
      app_root: () => Promise<string>,
      splits: {
        write: (relative: string, contents: string, append?: boolean) => Promise<string>,
        read: (relative: string) => Promise<string | null>,
        exists: (relative: string) => Promise<boolean>,
        list: (relative: string) => Promise<DirectoryEntry[]>,
        copy: (from: string, to: string) => Promise<string>,
        mkdir: (relative: string) => Promise<string>,
        reveal: (relative: string) => Promise<string>,
      },
      data: {
        read: (relative: string) => Promise<string | null>,
        write: (relative: string, contents: string) => Promise<string>,
        list: (relative: string) => Promise<DirectoryEntry[]>,
      },
      storage: {
        read: (relative: string) => Promise<string | null>,
        write: (relative: string, contents: string) => Promise<string>,
      },
      source: {
        write: (relative: string, contents: string) => Promise<string>,
      },
      obsAuth: (password: string, salt: string, challenge: string) => Promise<string>,
      setGameIcon: (iconName: string) => Promise<boolean>,
      onControlRequest: (handler: ControlHandler) => () => void,
      onKeyEvent: (handler: (key: KeyEvent) => void) => () => void,
    }
  }
}
