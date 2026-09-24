import { open } from "fs/promises";
import { readReplayBookmarks, type ByteSource, type ReplayBookmarksResult } from "../shared/replayBookmarks";

/**
 * A `.replay` file's bookmarks, read through two ranged reads (the header and the
 * bookmark section) so that opening a multi-hundred-megabyte replay costs nothing
 * but its bookmarks. The parsing is `src/shared/replayBookmarks.ts`; this is the `fs`.
 */
export async function readReplayFileBookmarks(path: string): Promise<ReplayBookmarksResult> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const source: ByteSource = {
      size,
      read: async (offset, length) => {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
      },
    };
    return await readReplayBookmarks(source);
  } finally {
    await handle.close();
  }
}
