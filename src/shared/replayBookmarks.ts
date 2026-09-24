/**
 * The bookmarks of a Super Shuckie `.replay` file, read from the file itself.
 *
 * A closed replay of format v5 or later ends with an editable *bookmark section*
 * (`supershuckie-replay-recorder/src/replay_file/bookmark_section.rs`): the header's
 * `packet_stream_end` says where the packet stream stops, and everything after it is the
 * section. So the bookmarks of a multi-hundred-megabyte replay are read from two small
 * ranges -- the 2048-byte header and the section -- and the packet stream is never
 * touched. That is what lets the overlay open another run's replay as its split
 * comparison without Super Shuckie (`src/main/splitComparison.ts`).
 *
 * Layout (all integers little-endian; `uint` is the recorder's `UnsignedInteger`: one
 * length byte 0..8, then that many bytes):
 *
 * ```text
 * header      0x000 [4] "NIDO"   0x004 u32 replay_version   0x3A8 u64 packet_stream_end   0x7FC [4] "RINA"
 * section     +0x00 [4] "SSBM"   +0x04 u32 format (1)   +0x08 u64 payload length   +0x10 [32] blake3   +0x30 payload
 * payload     u32 table format (1) . uint next_id . uint n . n x bytevec(type) . uint m . m x bytevec(bookmark)
 * type        uint id . string name . u32 color (0xRRGGBB)
 * bookmark    uint id . string name . uint type_id . uint in_frame . uint in_millis . uint flags . uint out_frame . uint out_millis
 *             flags: bit 0 = has out, bit 1 = keyframe; a record may carry trailing bytes a newer writer added
 * string / bytevec   uint length . bytes
 * ```
 *
 * `packet_stream_end` of 0 means the stream runs to the end of the file: a recording
 * still in progress, a crash file, or a file older than v5 -- none of which has a
 * section. (Such a file may hold `BookmarkTable` snapshot packets inside the stream;
 * they are not read here.) The blake3 hash is not verified: the length check and the
 * magic are what stand between a damaged section and a parse, and a section that does
 * not parse is reported, not guessed at.
 *
 * Verified against a v6 file written by `supershuckie-replay-convert` (its three legacy
 * bookmarks decode with the frames and times Super Shuckie shows) and, for every field,
 * against a copy of the recorder's encoder in `tools/parity/replay-splits-selftest.ts`.
 * Shared by the main process (file reads) and the renderer (tests, and any future
 * in-renderer reader), so nothing here touches `fs`.
 */

export const REPLAY_HEADER_LENGTH = 2048;
export const REPLAY_VERSION_BOOKMARK_SECTION = 5;
export const BOOKMARK_SECTION_HEADER_LENGTH = 0x30;

const SIGNATURE_START = "NIDO";
const SIGNATURE_END = "RINA";
const SIGNATURE_END_OFFSET = 0x7fc;
const VERSION_OFFSET = 0x004;
const PATCH_DATA_LENGTH_OFFSET = 0x110;
const PACKET_STREAM_END_OFFSET = 0x3a8;
const BOOKMARK_SECTION_MAGIC = "SSBM";
const BOOKMARK_SECTION_FORMAT = 1;
const BOOKMARK_TABLE_FORMAT = 1;
const FLAG_HAS_OUT = 1n << 0n;
const FLAG_KEYFRAME = 1n << 1n;

/** A bookmark type as the replay recorded it; `id` is the 16-hex-digit form the REST API uses. */
export interface ReplayBookmarkType {
	id: string;
	name: string;
	/** `#RRGGBB`, like the REST API. */
	color: string;
}

/** One bookmark, in the shape `GET /bookmarks` returns it (external-contracts.md section 3). */
export interface ReplayBookmark {
	id: number;
	name: string;
	type: ReplayBookmarkType | null;
	in_frame: number;
	in_millis: number;
	out_frame: number | null;
	out_millis: number | null;
	keyframe: boolean;
}

export interface ReplayBookmarkTable {
	nextId: number;
	types: ReplayBookmarkType[];
	/** In `(in_frame, id)` order, as the recorder keeps them. */
	bookmarks: ReplayBookmark[];
}

export interface ReplayHeader {
	version: number;
	patchDataLength: number;
	/** Absolute offset of the bookmark section; null for a file without one. */
	packetStreamEnd: number | null;
}

/** Enough of a file to read its bookmarks: its size and a ranged read. */
export interface ByteSource {
	size: number;
	/** The bytes at `offset`; fewer than `length` only at the end of the file. */
	read(offset: number, length: number): Promise<Uint8Array>;
}

export type ReplayBookmarksResult =
	| { ok: true; version: number; table: ReplayBookmarkTable }
	| { ok: false; error: string; version?: number };

export class ReplayFormatError extends Error {}

// ------------------------------------------------------------------ primitives

/** A cursor over a byte slice, reading the recorder's `PacketIO` primitives. */
class Reader {
	pos = 0;
	constructor(private readonly bytes: Uint8Array) {}

	private need(n: number, what: string): void {
		if (this.pos + n > this.bytes.length) throw new ReplayFormatError(`not enough data for ${what}`);
	}

	byte(what = "byte"): number {
		this.need(1, what);
		return this.bytes[this.pos++];
	}

	/** `UnsignedInteger`: a length byte, then that many little-endian bytes. */
	uintBig(what = "integer"): bigint {
		const len = this.byte(what);
		if (len > 8) throw new ReplayFormatError(`invalid integer (bad byte length ${len}) in ${what}`);
		this.need(len, what);
		let value = 0n;
		for (let i = 0; i < len; i++) value |= BigInt(this.bytes[this.pos + i]) << BigInt(8 * i);
		this.pos += len;
		return value;
	}

	/** A `UnsignedInteger` that fits a JS number (frames, times, counts, bookmark ids). */
	uint(what = "integer"): number {
		const value = this.uintBig(what);
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ReplayFormatError(`${what} is too large: ${value}`);
		return Number(value);
	}

	/** A raw little-endian `u32` (the table format, a type's colour). */
	u32(what = "u32"): number {
		this.need(4, what);
		const value = u32At(this.bytes, this.pos);
		this.pos += 4;
		return value;
	}

	/** `ByteVec` / `String`: a `usize` length, then the bytes. */
	bytevec(what = "bytes"): Uint8Array {
		const len = this.uint(`${what} length`);
		this.need(len, what);
		const out = this.bytes.subarray(this.pos, this.pos + len);
		this.pos += len;
		return out;
	}

	string(what = "string"): string {
		return utf8.decode(this.bytevec(what));
	}
}

const utf8 = new TextDecoder("utf-8");

function ascii(bytes: Uint8Array, offset: number, length: number): string {
	let out = "";
	for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
	return out;
}

function u64At(bytes: Uint8Array, offset: number): bigint {
	let value = 0n;
	for (let i = 0; i < 8; i++) value |= BigInt(bytes[offset + i]) << BigInt(8 * i);
	return value;
}

function u32At(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) + bytes[offset + 3] * 0x1000000;
}

/** A type id as the REST API spells it: 16 lower-case hex digits. */
export function formatTypeId(id: bigint): string {
	return id.toString(16).padStart(16, "0");
}

function formatColor(rgb: number): string {
	return "#" + (rgb & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
}

// ---------------------------------------------------------------------- header

/** Parses the fixed 2048-byte header. Throws {@link ReplayFormatError} for a non-replay. */
export function parseReplayHeader(bytes: Uint8Array): ReplayHeader {
	if (bytes.length < REPLAY_HEADER_LENGTH) throw new ReplayFormatError("the file is too short to be a replay");
	if (ascii(bytes, 0, 4) !== SIGNATURE_START || ascii(bytes, SIGNATURE_END_OFFSET, 4) !== SIGNATURE_END) {
		throw new ReplayFormatError("not a Super Shuckie replay (signature mismatch)");
	}
	const version = u32At(bytes, VERSION_OFFSET);
	const patchDataLength = Number(u64At(bytes, PATCH_DATA_LENGTH_OFFSET));
	const end = version >= REPLAY_VERSION_BOOKMARK_SECTION ? u64At(bytes, PACKET_STREAM_END_OFFSET) : 0n;
	return { version, patchDataLength, packetStreamEnd: end === 0n ? null : Number(end) };
}

// ----------------------------------------------------------------------- table

/** Decodes a `BookmarkTable` payload (the section's payload, or a snapshot packet's). */
export function decodeBookmarkTable(payload: Uint8Array): ReplayBookmarkTable {
	const r = new Reader(payload);
	const format = r.u32("table format");
	if (format === 0 || format > BOOKMARK_TABLE_FORMAT) throw new ReplayFormatError(`unsupported bookmark table format ${format}`);
	const nextId = r.uint("next_id");

	const typeCount = r.uint("type count");
	const typesById = new Map<bigint, ReplayBookmarkType>();
	const types: ReplayBookmarkType[] = [];
	for (let i = 0; i < typeCount; i++) {
		const rec = new Reader(r.bytevec(`type record ${i}`));
		const id = rec.uintBig("type id");
		const type: ReplayBookmarkType = { id: formatTypeId(id), name: rec.string("type name"), color: formatColor(rec.u32("type colour")) };
		typesById.set(id, type);
		types.push(type);
	}

	const bookmarkCount = r.uint("bookmark count");
	const bookmarks: ReplayBookmark[] = [];
	for (let i = 0; i < bookmarkCount; i++) {
		const rec = new Reader(r.bytevec(`bookmark record ${i}`));
		const id = rec.uint("bookmark id");
		const name = rec.string("bookmark name");
		const typeId = rec.uintBig("bookmark type id");
		const in_frame = rec.uint("in frame");
		const in_millis = rec.uint("in millis");
		const flags = rec.uintBig("flags");
		const outFrame = rec.uint("out frame");
		const outMillis = rec.uint("out millis");
		const hasOut = (flags & FLAG_HAS_OUT) !== 0n;
		bookmarks.push({
			id,
			name,
			// An untyped bookmark is 0; a type the replay does not record shows as untyped,
			// which is what Super Shuckie does when the user's settings do not know it either.
			type: typeId === 0n ? null : (typesById.get(typeId) ?? null),
			in_frame,
			in_millis,
			out_frame: hasOut ? outFrame : null,
			out_millis: hasOut ? outMillis : null,
			keyframe: (flags & FLAG_KEYFRAME) !== 0n,
		});
	}
	bookmarks.sort((a, b) => a.in_frame - b.in_frame || a.id - b.id);
	return { nextId, types, bookmarks };
}

/** Decodes a whole section: `bytes` runs from `packet_stream_end` to the end of the file. */
export function decodeBookmarkSection(bytes: Uint8Array): ReplayBookmarkTable {
	if (bytes.length < BOOKMARK_SECTION_HEADER_LENGTH) throw new ReplayFormatError("the bookmark section is cut short");
	if (ascii(bytes, 0, 4) !== BOOKMARK_SECTION_MAGIC) throw new ReplayFormatError("the bookmark section has an unknown signature");
	const format = u32At(bytes, 4);
	if (format !== BOOKMARK_SECTION_FORMAT) throw new ReplayFormatError(`the bookmark section uses layout ${format}, which this version cannot read`);
	const recorded = u64At(bytes, 8);
	const present = BigInt(bytes.length - BOOKMARK_SECTION_HEADER_LENGTH);
	if (recorded !== present) throw new ReplayFormatError(`the bookmark section records ${recorded} bytes of bookmarks but ${present} are present`);
	return decodeBookmarkTable(bytes.subarray(BOOKMARK_SECTION_HEADER_LENGTH));
}

// ------------------------------------------------------------------------ file

/**
 * The bookmarks of a replay, from its header and section only. Never throws: a file
 * that is not a closed v5+ replay comes back as `{ ok: false, error }` with the reason
 * Super Shuckie itself would give.
 */
export async function readReplayBookmarks(source: ByteSource): Promise<ReplayBookmarksResult> {
	try {
		const header = parseReplayHeader(await source.read(0, REPLAY_HEADER_LENGTH));
		const { version } = header;
		if (version < REPLAY_VERSION_BOOKMARK_SECTION) {
			return { ok: false, version, error: `format v${version} replays keep no bookmark section; open it in Super Shuckie and add a bookmark (or convert it) first` };
		}
		if (header.packetStreamEnd === null) {
			return { ok: false, version, error: "this replay has no bookmark section: the recording was never closed (still recording, or a crash file)" };
		}
		const start = header.packetStreamEnd;
		const packetsStart = REPLAY_HEADER_LENGTH + header.patchDataLength;
		if (start < packetsStart || start > source.size) {
			return { ok: false, version, error: `its packet stream ends at byte ${start}, outside the file (${source.size} bytes)` };
		}
		const table = decodeBookmarkSection(await source.read(start, source.size - start));
		return { ok: true, version, table };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** A {@link ByteSource} over bytes already in memory (tests, small files). */
export function byteSourceOf(bytes: Uint8Array): ByteSource {
	return {
		size: bytes.length,
		read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)),
	};
}
