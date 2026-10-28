import { ElectronAPI } from '@electron-toolkit/preload'
import type { SplitComparison } from '../main/splitComparison'
import type { ShortcutCatalog, ShortcutEdit } from '../shared/shortcuts'
import type { ReportPayload } from '../shared/report'
import type { UpdateState } from '../shared/updates'

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


declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      /** Outstanding main-process calls; used by the parity harness, not by the app. */
      __pendingIpc: () => number,
      /** The clock page's URL (src/main/timer-frame-server.ts), or null when the frame is off. */
      timerFrameUrl: string | null,
      settings_dir: () => Promise<string>,
      app_root: () => Promise<string>,
      is_packaged: () => Promise<boolean>,
      /** A file under resources/icons/, or "" to put the portrait back. */
      set_game_icon: (relative: string) => void,
      send_virtual_key: (keyName: string | number) => void,
      splits: {
        write: (relative: string, contents: string, append?: boolean) => Promise<string>,
        read: (relative: string) => Promise<string | null>,
        exists: (relative: string) => Promise<boolean>,
        list: (relative: string) => Promise<DirectoryEntry[]>,
        copy: (from: string, to: string) => Promise<string>,
        mkdir: (relative: string) => Promise<string>,
        reveal: (relative: string) => Promise<string>,
        pickComparison: () => Promise<SplitComparison | null>,
        loadComparison: (file: string) => Promise<SplitComparison>,
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
      report: {
        capture: () => Promise<string>,
        save: (payload: ReportPayload) => Promise<string>,
        cancel: () => Promise<void>,
      },
      updates: {
        getState: () => Promise<UpdateState>,
        check: () => Promise<UpdateState>,
        install: (version: string) => Promise<UpdateState>,
        rollback: () => Promise<UpdateState>,
        restart: () => Promise<UpdateState>,
        cancel: () => void,
        openWindow: () => void,
        openPage: (url: string) => void,
        onState: (handler: (state: UpdateState) => void) => () => void,
      },
      obsAuth: (password: string, salt: string, challenge: string) => Promise<string>,
      onControlRequest: (handler: ControlHandler) => () => void,
      shortcuts: {
        register: (accelerators: string[]) => void,
        onPressed: (handler: (accelerator: string) => void) => () => void,
        publishCatalog: (catalog: ShortcutCatalog) => void,
        onEdit: (handler: (edit: ShortcutEdit) => void) => () => void,
        onRefresh: (handler: () => void) => () => void,
        openMenu: () => void,
        getCatalog: () => Promise<ShortcutCatalog | null>,
        onCatalog: (handler: (catalog: ShortcutCatalog) => void) => () => void,
        edit: (edit: ShortcutEdit) => void,
        refresh: () => void,
        suspend: () => void,
        resume: () => void,
      },
    }
  }
}
