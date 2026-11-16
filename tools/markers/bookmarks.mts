import fs from "node:fs";
import { readReplayBookmarks } from "../../src/shared/replayBookmarks.ts";
const file = process.argv[2];
const fd = fs.openSync(file, "r");
const size = fs.fstatSync(fd).size;
const res = await readReplayBookmarks({ size, read: async (o, l) => { const b = Buffer.alloc(Math.min(l, size - o)); fs.readSync(fd, b, 0, b.length, o); return new Uint8Array(b); } });
if (!res.ok) { console.error(res.error); process.exit(1); }
for (const b of res.table.bookmarks) console.log(`${b.in_frame},${b.in_millis},${b.name}`);
