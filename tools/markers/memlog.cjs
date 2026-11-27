// memlog: every change of chosen PokeAByte properties through a Super Shuckie replay, frame by frame.
// Drives the Router's headless tools (xpr-replay-worker + pab-host) in parallel chunks.
//
//   node tools/markers/memlog.cjs --replay <f> --rom <f> --mapper ST/gen4/pokemon_platinum_ne.xml --paths <regex>
//                  [--from 0] [--to end] [--stride 1] [--chunks 8] --out <file.csv>
// Output: frame@replayMs,path,value (JSON value), only on change, in frame order. Lines at a chunk boundary
// take the frame of the next change. Tools: the Router's replay_to_route (A:/pkmn_yellow_xp_router/tools/replay_to_route).
// --mappers <dir> reads mappers from elsewhere than %APPDATA%\PokeAByte\Mappers (a patched copy).
// --snapshot <file.json> also writes every property's value at the first frame read ({path: value}): a short replay
// that starts mid-game never changes most of them, so they are in no log line (mem-to-scenario.ts --initial).
// --worker <xpr-replay-worker.exe> uses another build of the replay reader (the Router's has no 3DS core yet).
// --pab <pab-host.exe> uses another build of the mapper host (3DS mappers need one built from a
// Poke-A-Byte that knows the 3DS platform; see docs/gen6-inventory.md).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');

const TOOLS = 'A:/pkmn_yellow_xp_router/tools/replay_to_route/out';
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const WORKER = args.worker || TOOLS + '/xpr-replay-worker.exe';
const MAPPERS = args.mappers || (process.env.APPDATA + '/PokeAByte/Mappers');
const stride = +(args.stride || 1), nChunks = +(args.chunks || 8), WARM = 1200;
const pathRe = new RegExp(args.paths);

class Proc {
  constructor(exe, argv) {
    this.p = spawn(exe, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = Buffer.alloc(0); this.waiters = []; this.msgs = [];
    this.p.stderr.on('data', d => { if (process.env.MEMLOG_DEBUG) process.stderr.write(d); });
    this.p.stdout.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(0); if (this.buf.length < 4 + n) break;
        const m = this.buf.subarray(4, 4 + n); this.buf = this.buf.subarray(4 + n);
        const w = this.waiters.shift(); if (w) w(m); else this.msgs.push(m);
      }
    });
    this.p.on('exit', c => { const e = new Error(exe + ' exited ' + c); for (const w of this.waiters) w(null, e); });
  }
  next() { return this.msgs.length ? Promise.resolve(this.msgs.shift()) : new Promise(r => this.waiters.push(r)); }
  write(b) { this.p.stdin.write(b); }
}

async function chunk(from, to, idx) {
  const pab = new Proc(args.pab || TOOLS + '/pab-host/pab-host.exe', ['--mappers', MAPPERS, '--mapper', args.mapper, '--compact']);
  const hello = JSON.parse((await pab.next()).toString());
  if (hello.error) throw new Error(hello.error);
  const wk = new Proc(WORKER, ['--replay', args.replay, '--rom', args.rom, '--allow-mismatch']);
  const ready = await wk.next(); if (ready[0] !== 0x4a) throw new Error('worker: ' + ready);
  wk.write('blocks ' + hello.blocks.map(([s, l]) => s + ':' + l).join(',') + '\n');
  await wk.next();
  const start = Math.max(0, from - WARM);
  wk.write(`job 1 d ${start} ${to} ${stride}\n`);
  const state = new Map(), lines = []; let boundaryDone = from === 0, count = 0;
  for (;;) {
    const m = await wk.next();
    if (!m) throw new Error('worker died');
    if (m[0] === 0x45) break;           // 'E'
    if (m[0] === 0x4a) { const j = JSON.parse(m.subarray(1)); if (j.error) throw new Error(j.error); continue; }
    if (m[0] !== 0x44) continue;        // 'D'
    const frame = Number(m.readBigUInt64LE(1)), ms = Number(m.readBigUInt64LE(9));
    const s = Buffer.alloc(1 + m.length - 17); s[0] = 0x53; m.copy(s, 1, 17);
    pab.write(s);
    const ans = JSON.parse((await pab.next()).toString());
    if (!Array.isArray(ans)) throw new Error('pab-host: ' + JSON.stringify(ans).slice(0, 200));
    if (args.snapshot && idx === 0 && count === 0) {
      // 'M': the mapper as GET /mapper serves it, values included.
      pab.write(Buffer.from('M'));
      const mapper = JSON.parse((await pab.next()).toString());
      const values = {};
      for (const p of mapper.properties ?? []) values[p.path] = p.value ?? null;
      fs.writeFileSync(args.snapshot, JSON.stringify({ frame, ms, values }));
    }
    for (const c of ans) {
      if (!pathRe.test(c.path)) continue;
      const v = JSON.stringify(c.value);
      if (frame < from) { state.set(c.path, v); continue; }
      if (state.get(c.path) === v) continue;
      state.set(c.path, v); lines.push([frame + '@' + ms, c.path, v]);
    }
    if (!boundaryDone && frame >= from) { boundaryDone = true; lines.unshift(['STATE', [...state]]); }
    if (++count % 20000 === 0) process.stderr.write(`chunk ${idx}: frame ${frame}/${to}\n`);
  }
  if (!boundaryDone) lines.unshift(['STATE', [...state]]);
  wk.write('quit\n'); pab.write(Buffer.from('Q'));
  return lines;
}

(async () => {
  let to = +args.to;
  if (!to) {
    const info = JSON.parse(require('child_process').execFileSync(WORKER, ['--replay', args.replay, '--info']).toString());
    to = info.total_frames - 1;
  }
  const from = +(args.from || 0), size = Math.ceil((to - from + 1) / nChunks);
  const t0 = Date.now();
  const parts = await Promise.all([...Array(nChunks)].map((_, i) => chunk(from + i * size, Math.min(to, from + (i + 1) * size - 1), i)));
  const cur = new Map(), out = [];
  for (const lines of parts) for (const l of lines) {
    if (l[0] === 'STATE') { for (const [p, v] of l[1]) if (cur.get(p) !== v) { cur.set(p, v); out.push(`${'B'},${p},${v}`); } continue; }
    const [f, p, v] = l; if (cur.get(p) === v) continue; cur.set(p, v); out.push(`${f},${p},${v}`);
  }
  // chunk-boundary lines ('B') take the frame of the next real line
  let lastF = String(from); for (let i = out.length - 1; i >= 0; i--) { if (out[i][0] === 'B') out[i] = lastF + out[i].slice(1); else lastF = out[i].split(',')[0]; }
  fs.writeFileSync(args.out, out.join('\n') + '\n');
  console.error(`done: ${out.length} changes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch(e => { console.error(e); process.exit(1); });
