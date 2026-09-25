/**
 * The image pool as lossless WebP: every PNG under `src/renderer/public/images/`
 * becomes a `.webp` of the same name that decodes to the same pixels.
 *
 *   npx tsx tools/assets/to-webp.ts --libwebp=<dir>                   convert in place, keep the PNGs
 *   npx tsx tools/assets/to-webp.ts --libwebp=<dir> --delete          ...and remove each PNG once verified
 *   npx tsx tools/assets/to-webp.ts --libwebp=<dir> --out=<dir>       write the WebPs into a staging tree
 *   npx tsx tools/assets/to-webp.ts --libwebp=<dir> --only=gen5/pokemon --jobs=8   (--only: a regex on the path)
 *
 * `--libwebp` is the `bin` folder of Google's libwebp release (cwebp, dwebp and
 * webpmux; https://developers.google.com/speed/webp/download). A WebP that already
 * exists is left alone unless `--force`, so an interrupted run resumes.
 *
 * Why the pipeline is not simply `cwebp in.png`:
 *
 * - The Windows cwebp decodes its input through WIC, whose handling of 16-bit
 *   samples and gAMA is its own. Each PNG is decoded here instead (pngjs, which
 *   ignores gAMA as Chromium does) and handed to cwebp as a plain 8-bit RGBA PNG
 *   with no ancillary chunks. A 16-bit sample keeps its high byte, which is what
 *   Chromium draws (pngjs's own rescale rounds, one level off on a third of them).
 * - Colour management has to survive. Chromium colour-manages a PNG by its sRGB
 *   chunk, else its iCCP profile, else cHRM+gAMA together; a WebP carries only an
 *   ICC profile. An iCCP profile is copied into the WebP's ICCP chunk (webpmux); an
 *   sRGB chunk needs nothing, WebP's default being sRGB; cHRM+gAMA is rebuilt as an
 *   equivalent ICC profile (`profileFromChrmGama`). gAMA or cHRM alone Chromium
 *   ignores, so they are dropped.
 * - Lossless, but not `-exact`: the colour under a fully transparent pixel is free
 *   for the encoder to change (4% of the output on a sample). Chromium draws images
 *   premultiplied, so that colour never reaches the screen.
 *
 * Each WebP is verified before it is kept: dwebp decodes it and every pixel must
 * match the PNG's -- alpha everywhere, colour wherever alpha is not zero -- and the
 * ICC profile must round-trip byte for byte. A file that is not a PNG at all (five
 * textures are JPEG data under a .png name) is reported and left alone.
 *
 * `tools/assets/verify-webp-render.ts` is the second half of the proof: it decodes
 * both files in Electron's Chromium and compares what the canvas gets.
 */
import { execFile } from "node:child_process";
import { cpus, tmpdir } from "node:os";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import { PNG } from "pngjs";

const run = promisify(execFile);

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const REPO = resolve(import.meta.dirname, "..", "..");
const ROOT = resolve(flag("root") ?? join(REPO, "src", "renderer", "public", "images"));
const OUT = resolve(flag("out") ?? ROOT);
const LIBWEBP = flag("libwebp");
const JOBS = Number(flag("jobs") ?? Math.max(1, cpus().length - 2));
const ONLY = flag("only") ? new RegExp(flag("only")!) : null;
const FORCE = argv.includes("--force");
const DELETE = argv.includes("--delete");

const tool = (name: string) => (LIBWEBP ? join(LIBWEBP, `${name}.exe`) : name);

interface PngInfo {
  depth: number;
  /** Where Chromium takes the colour space from. */
  colour: "sRGB" | "iCCP" | "cHRM+gAMA" | "none";
  icc: Buffer | null;
  chrm: number[] | null;
  gama: number | null;
}

/** The chunks that decide how Chromium colour-manages the file. */
function readPngInfo(bytes: Buffer): PngInfo {
  const chunks = new Map<string, Buffer>();
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString("latin1", off + 4, off + 8);
    if (!chunks.has(type)) chunks.set(type, bytes.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === "IEND") break;
  }
  const iccp = chunks.get("iCCP");
  const chrm = chunks.get("cHRM");
  const gama = chunks.get("gAMA");
  const icc = iccp ? inflateSync(iccp.subarray(iccp.indexOf(0) + 2)) : null;
  const colour = chunks.has("sRGB") ? "sRGB" : icc ? "iCCP" : chrm && gama ? "cHRM+gAMA" : "none";
  return {
    depth: chunks.get("IHDR")![8],
    colour,
    icc,
    chrm: chrm ? Array.from({ length: 8 }, (_, i) => chrm.readUInt32BE(i * 4) / 100000) : null,
    gama: gama ? gama.readUInt32BE(0) / 100000 : null,
  };
}

/**
 * An ICC v2 matrix/TRC profile equivalent to a PNG's cHRM + gAMA, built the way
 * Chromium builds its colour space from them (skcms_PrimariesToXYZD50: primaries to
 * XYZ, Bradford-adapted to D50; transfer function x^(1/gAMA)). The curve is a
 * `para` type-0 curve, whose s15Fixed16 exponent carries the gamma exactly enough
 * that a `curv` gamma's 1/256 steps would not.
 */
function profileFromChrmGama(chrm: number[], gama: number): Buffer {
  const [wx, wy, rx, ry, gx, gy, bx, by] = chrm;
  const xyz = (x: number, y: number) => [x / y, 1, (1 - x - y) / y];
  const [R, G, B, W] = [xyz(rx, ry), xyz(gx, gy), xyz(bx, by), xyz(wx, wy)];
  const P = [
    [R[0], G[0], B[0]],
    [R[1], G[1], B[1]],
    [R[2], G[2], B[2]],
  ];
  const S = mul(inv(P), [[W[0]], [W[1]], [W[2]]]).map((r) => r[0]);
  const toXYZ = P.map((row) => row.map((v, j) => v * S[j]));
  // Bradford adaptation from the file's white point to the ICC's D50.
  const brad = [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ];
  const D50 = [0.96422, 1.0, 0.82521];
  const srcCone = mul(brad, W.map((v) => [v])).map((r) => r[0]);
  const dstCone = mul(brad, D50.map((v) => [v])).map((r) => r[0]);
  const scale = [
    [dstCone[0] / srcCone[0], 0, 0],
    [0, dstCone[1] / srcCone[1], 0],
    [0, 0, dstCone[2] / srcCone[2]],
  ];
  const toD50 = mul(mul(mul(inv(brad), scale), brad), toXYZ);

  const s15 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(Math.round(v * 65536));
    return b;
  };
  const xyzTag = (v: number[]) => Buffer.concat([Buffer.from("XYZ \0\0\0\0", "latin1"), ...v.map(s15)]);
  const para = Buffer.concat([Buffer.from("para\0\0\0\0\0\0\0\0", "latin1"), s15(1 / gama)]);
  const text = (s: string) => Buffer.concat([Buffer.from("text\0\0\0\0", "latin1"), Buffer.from(s + "\0", "latin1")]);
  const desc = (s: string) => {
    // ASCII count + string, then an empty Unicode and ScriptCode description.
    const b = Buffer.alloc(12 + s.length + 1 + 4 + 4 + 2 + 1 + 67);
    b.write("desc", 0, "latin1");
    b.writeUInt32BE(s.length + 1, 8);
    b.write(s, 12, "latin1");
    return b;
  };
  const tags: [string, Buffer][] = [
    ["desc", desc("PNG cHRM+gAMA")],
    ["cprt", text("No copyright")],
    ["wtpt", xyzTag(D50)],
    ["rXYZ", xyzTag([toD50[0][0], toD50[1][0], toD50[2][0]])],
    ["gXYZ", xyzTag([toD50[0][1], toD50[1][1], toD50[2][1]])],
    ["bXYZ", xyzTag([toD50[0][2], toD50[1][2], toD50[2][2]])],
    ["rTRC", para],
    ["gTRC", para],
    ["bTRC", para],
  ];
  const pad4 = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const table = Buffer.alloc(4 + tags.length * 12);
  table.writeUInt32BE(tags.length, 0);
  const bodies: Buffer[] = [];
  const offsets = new Map<Buffer, number>();
  let cursor = 128 + table.length;
  tags.forEach(([sig, data], i) => {
    // The three TRCs share one body, as ICC allows.
    if (!offsets.has(data)) {
      offsets.set(data, cursor);
      const padded = pad4(data);
      bodies.push(padded);
      cursor += padded.length;
    }
    table.write(sig, 4 + i * 12, "latin1");
    table.writeUInt32BE(offsets.get(data)!, 8 + i * 12);
    table.writeUInt32BE(data.length, 12 + i * 12);
  });
  const header = Buffer.alloc(128);
  header.writeUInt32BE(cursor, 0);
  header.writeUInt32BE(0x02100000, 8);
  header.write("mntrRGB XYZ ", 12, "latin1");
  header.write("acsp", 36, "latin1");
  [0.9642, 1.0, 0.8249].forEach((v, i) => s15(v).copy(header, 68 + i * 4));
  return Buffer.concat([header, table, ...bodies]);
}

function mul(a: number[][], b: number[][]): number[][] {
  return a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
}

function inv(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

/** dwebp's PAM output: header lines up to ENDHDR, then RGBA. */
function readPam(bytes: Buffer): { width: number; height: number; data: Buffer } {
  const end = bytes.indexOf("ENDHDR\n");
  const header = bytes.toString("latin1", 0, end);
  const field = (name: string) => Number(new RegExp(`${name} (\\d+)`).exec(header)?.[1]);
  if (field("DEPTH") !== 4) throw new Error(`dwebp wrote DEPTH ${field("DEPTH")}, expected RGBA`);
  return { width: field("WIDTH"), height: field("HEIGHT"), data: bytes.subarray(end + 7) };
}

type Outcome =
  | { kind: "converted"; rel: string; before: number; after: number; colour: PngInfo["colour"] }
  | { kind: "skipped"; rel: string; reason: string }
  | { kind: "failed"; rel: string; reason: string };

async function convert(file: string, scratch: string): Promise<Outcome> {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const target = join(OUT, rel.replace(/\.png$/i, ".webp"));
  if (existsSync(target) && !FORCE) return { kind: "skipped", rel, reason: "WebP already there" };

  const bytes = readFileSync(file);
  if (bytes.readUInt32BE(0) !== 0x89504e47) return { kind: "skipped", rel, reason: `not a PNG (starts ${bytes.subarray(0, 4).toString("hex")})` };
  const info = readPngInfo(bytes);
  const png = PNG.sync.read(bytes, { skipRescale: info.depth === 16 });
  if (info.depth === 16) png.data = Buffer.from((png.data as unknown as Uint16Array).map((v) => v >> 8));

  const input = join(scratch, "in.png");
  const encoded = join(scratch, "out.webp");
  const tagged = join(scratch, "tagged.webp");
  const decoded = join(scratch, "check.pam");
  const iccFile = join(scratch, "profile.icc");
  const iccBack = join(scratch, "back.icc");
  writeFileSync(input, PNG.sync.write({ width: png.width, height: png.height, data: png.data } as PNG, { colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 1 }));
  await run(tool("cwebp"), ["-lossless", "-z", "9", "-quiet", input, "-o", encoded]);

  const icc = info.colour === "iCCP" ? info.icc : info.colour === "cHRM+gAMA" ? profileFromChrmGama(info.chrm!, info.gama!) : null;
  let result = encoded;
  if (icc) {
    writeFileSync(iccFile, icc);
    await run(tool("webpmux"), ["-set", "icc", iccFile, encoded, "-o", tagged]);
    await run(tool("webpmux"), ["-get", "icc", tagged, "-o", iccBack]);
    if (!readFileSync(iccBack).equals(icc)) return { kind: "failed", rel, reason: "ICC profile did not round-trip" };
    result = tagged;
  }

  await run(tool("dwebp"), ["-pam", "-quiet", result, "-o", decoded]);
  const back = readPam(readFileSync(decoded));
  if (back.width !== png.width || back.height !== png.height) {
    return { kind: "failed", rel, reason: `decoded ${back.width}x${back.height}, PNG is ${png.width}x${png.height}` };
  }
  const a = png.data;
  const b = back.data;
  for (let i = 0; i < a.length; i += 4) {
    const alpha = a[i + 3];
    if (alpha !== b[i + 3] || (alpha !== 0 && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]))) {
      const p = i / 4;
      return { kind: "failed", rel, reason: `pixel ${p % png.width},${Math.floor(p / png.width)} is ${[...b.subarray(i, i + 4)]}, PNG has ${[...a.subarray(i, i + 4)]}` };
    }
  }

  mkdirSync(dirname(target), { recursive: true });
  const after = statSync(result).size;
  renameSync(result, target);
  if (DELETE && OUT === ROOT) unlinkSync(file);
  return { kind: "converted", rel, before: bytes.length, after, colour: info.colour };
}

function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else if (entry.isFile() && /\.png$/i.test(entry.name)) into.push(full);
  }
  return into;
}

const files = walk(ROOT).filter((f) => !ONLY || ONLY.test(relative(ROOT, f).replaceAll("\\", "/")));
console.log(`${files.length} PNG(s) under ${relative(REPO, ROOT) || ROOT}, ${JOBS} job(s)${OUT === ROOT ? "" : `, writing to ${OUT}`}`);

const outcomes: Outcome[] = [];
const queue = [...files];
const scratchRoot = mkdtempSync(join(tmpdir(), "stp-webp-"));
const started = Date.now();
await Promise.all(
  Array.from({ length: JOBS }, async (_, job) => {
    const scratch = join(scratchRoot, String(job));
    mkdirSync(scratch);
    while (queue.length) {
      const file = queue.shift()!;
      let outcome: Outcome;
      try {
        outcome = await convert(file, scratch);
      } catch (err) {
        outcome = { kind: "failed", rel: relative(ROOT, file), reason: (err as Error).message.split("\n")[0] };
      }
      outcomes.push(outcome);
      if (outcome.kind !== "converted") console.log(`  ${outcome.kind.toUpperCase()} ${outcome.rel}: ${outcome.reason}`);
      if (outcomes.length % 250 === 0) console.log(`  ${outcomes.length}/${files.length} (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }),
);
rmSync(scratchRoot, { recursive: true, force: true });

const converted = outcomes.filter((o): o is Extract<Outcome, { kind: "converted" }> => o.kind === "converted");
const before = converted.reduce((n, o) => n + o.before, 0);
const after = converted.reduce((n, o) => n + o.after, 0);
const mb = (n: number) => (n / 1048576).toFixed(1) + " MB";
const byColour = new Map<string, number>();
for (const o of converted) byColour.set(o.colour, (byColour.get(o.colour) ?? 0) + 1);
console.log(`\n${converted.length} converted: ${mb(before)} -> ${mb(after)} (${((100 * after) / Math.max(1, before)).toFixed(1)}%)`);
console.log(`colour: ${[...byColour].map(([k, v]) => `${k} ${v}`).join(", ")}`);
const failed = outcomes.filter((o) => o.kind === "failed").length;
const skipped = outcomes.filter((o) => o.kind === "skipped").length;
console.log(`${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
