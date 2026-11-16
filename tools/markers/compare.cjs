// Compare the markers a replay holds (its bookmarks: what the overlay wrote live) with what run-wiring.ts
// writes for the same replay, kind by kind, and run Cutter's own battle pairing over both.
//
//   node tools/markers/compare.cjs --old <bookmarks.csv> --new <run-wiring output> --game platinum
//        [--kinds "IN,OUT,Enemy Fainted"]   only these kinds (prefix before " - ")   [--list kind]  print the
//        unmatched markers of one kind   [--slack 30]  frames a marker may move and still count as the same
//
// Cutter: K:\Programs\air_cutter\extensions\run-cutter\lib\pairing.js (pairing and its per-game pairFilter).
'use strict';
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const slack = +(args.slack || 30);
const load = (f) => fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).map((l) => {
  const a = l.indexOf(','), b = l.indexOf(',', a + 1);
  return { f: +l.slice(0, a), ms: +l.slice(a + 1, b), s: l.slice(b + 1) };
}).filter((m) => m.s && !m.s.startsWith('SPLIT') && m.s !== 'x');
const kindOf = (s) => (s.startsWith('IN - ') ? (s === 'IN - Wild' ? 'IN - Wild' : 'IN') : s.startsWith('OUT - ') ? 'OUT' : s.replace(/ - .*/, ''));
const oldM = load(args.old), newM = load(args.new);
const onlyKinds = args.kinds ? new Set(args.kinds.split(',')) : null;

const kinds = [...new Set([...oldM, ...newM].map((m) => kindOf(m.s)))].filter((k) => !onlyKinds || onlyKinds.has(k)).sort();
console.log('kind'.padEnd(18), 'old'.padStart(6), 'new'.padStart(6), 'same'.padStart(6), 'moved'.padStart(6), 'old only'.padStart(9), 'new only'.padStart(9), '  median shift (frames)');
const unmatched = {};
for (const k of kinds) {
  const o = oldM.filter((m) => kindOf(m.s) === k), n = newM.filter((m) => kindOf(m.s) === k);
  const used = new Set(); let same = 0, moved = 0; const shifts = []; const oldOnly = [];
  for (const m of o) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < n.length; j++) {
      if (used.has(j) || n[j].s !== m.s) continue;
      const d = Math.abs(n[j].f - m.f); if (d < bd) { bd = d; best = j; }
      if (n[j].f > m.f + slack * 20) break;
    }
    if (best >= 0 && bd <= slack) { used.add(best); shifts.push(n[best].f - m.f); if (bd <= 2) same++; else moved++; } else oldOnly.push(m);
  }
  const newOnly = n.filter((_, j) => !used.has(j));
  unmatched[k] = { oldOnly, newOnly };
  shifts.sort((a, b) => a - b);
  console.log(k.padEnd(18), String(o.length).padStart(6), String(n.length).padStart(6), String(same).padStart(6), String(moved).padStart(6), String(oldOnly.length).padStart(9), String(newOnly.length).padStart(9), '  ' + (shifts.length ? shifts[shifts.length >> 1] : '-'));
}
if (args.list) {
  const u = unmatched[args.list] || { oldOnly: [], newOnly: [] };
  console.log(`\n${args.list}: old only`); u.oldOnly.forEach((m) => console.log(`  ${m.f} ${m.s}`));
  console.log(`${args.list}: new only`); u.newOnly.forEach((m) => console.log(`  ${m.f} ${m.s}`));
}

if (args.game) {
  const P = require('K:/Programs/air_cutter/extensions/run-cutter/lib/pairing.js');
  for (const [label, ms] of [['old', oldM], ['new', newM]]) {
    const marks = ms.map((m) => ({ time: m.ms / 1000, text: m.s }));
    const { pairs } = P.pairBattleBoundariesForRemoval(marks.filter((m) => m.text !== 'IN - Wild'), args.game);
    const kept = pairs.filter((p) => P.evaluateBattlePair(p, marks.filter((m) => m.time >= p.inSec && m.time <= p.outSec), args.game).valid);
    const long = kept.filter((p) => p.outSec - p.inSec > 180).length;
    const mismatched = kept.filter((p) => { const c = marks.find((m) => Math.abs(m.time - p.outSec) < 1e-6 && m.text.startsWith('OUT - ')); return c && c.text.slice(6) !== p.trainer; }).length;
    console.log(`Cutter (${args.game}) on ${label}: ${pairs.length} trainer pairs, ${kept.length} kept, ${long} kept over 3 min, ${mismatched} closed by another trainer's OUT`);
  }
}
