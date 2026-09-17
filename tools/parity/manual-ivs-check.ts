/**
 * Manual DVs/IVs (2026-09-17) through the harness: every generation on its fixture,
 * switched to Manual with a chosen spread before the replay, then the readout under the
 * fields, a screenshot of the panel, and -- where the fixture hands the starter over in
 * the lab (gen2's recording, gen3's scenario, gen1 on the lab variant this script
 * synthesises) -- the PokeAByte writes checked against the spread and the games' stat
 * formula.
 *
 *   npx tsx tools/parity/manual-ivs-check.ts [--only=gen1,gen3] [--out=tools/reports/manual-ivs]
 *
 * Uses run() with its beforeReplay hook and --redirect-ports, so nothing on the machine
 * has to be closed and no live PokeAByte is ever contacted. Real input is ignored during
 * a run, so the fields are driven through the DOM.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Page } from "playwright-core";
import { run } from "./run.ts";
import { REPO } from "./targets.ts";
import { gen12Stat, gen2HiddenPower, gen3HiddenPower, hpDv } from "../../src/renderer/core/logic/starterIvs.ts";

const argv = process.argv.slice(2);
const only = argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const outRoot = argv.find((a) => a.startsWith("--out="))?.slice(6) ?? join(REPO, "tools", "reports", "manual-ivs");
mkdirSync(outRoot, { recursive: true });

interface Case {
  gen: string;
  fixture: string;
  /** field class -> the values to type, in the fields' DOM order */
  fieldClass: string;
  values: number[];
  expectReadout: string;
  /** Expected by-bits DV/IV writes (path -> value), when the fixture reaches the lab. */
  expectBits?: Record<string, number>;
  /** Expected value writes (path -> value), when the fixture reaches the lab. */
  expectValues?: Record<string, number>;
  /** gen2: the patch byte the mode switch writes. */
  expectBytes?: Record<string, number[]>;
}

const mappers = join(process.env.APPDATA ?? "", "PokeAByte", "Mappers");

/** gen1's scenario hands Pikachu over in Pallet Town; the lab variant is where the DV hook listens. */
function gen1LabFixture(): string {
  const out = join(outRoot, "gen1-yellow-lab.fixture.jsonl.gz");
  if (existsSync(out)) return out;
  const scenario = JSON.parse(readFileSync(join(REPO, "tools", "parity", "scenarios", "gen1-yellow-smoke.json"), "utf8"));
  scenario.replayName = "gen1-yellow-lab";
  scenario.initial["overworld.map"] = "Pallet Town - Oak's Lab";
  const scenarioFile = join(outRoot, "gen1-yellow-lab.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario, null, 1));
  execFileSync(process.execPath, [
    join(REPO, "node_modules", "tsx", "dist", "cli.mjs"),
    join(REPO, "tools", "parity", "make-fixture.ts"),
    join(mappers, "DEPRECATED", "gen1", "pokemon_yellow_deprecated.xml"),
    "DEPRECATED/gen1/pokemon_yellow_deprecated.xml",
    scenarioFile,
    `--out=${out}`,
  ], { stdio: "inherit" });
  return out;
}

// Pikachu L5, DVs Atk 8 Def 4 Spe 15 Spc 2 (HP 2): pokered CalcStat with no stat exp.
const pika = { hp: 35, atk: 55, def: 30, spe: 90, spc: 50 };
const g1 = { atk: 8, def: 4, spe: 15, spc: 2 };
// Wigglytuff L5 (the recording's party species), DVs Atk 9 Def 6 Spe 12 Spc 3 (HP 9).
const wig = { hp: 140, atk: 70, def: 45, spa: 75, spd: 50, spe: 45 };
const g2 = { atk: 9, def: 6, spe: 12, spc: 3 };
const g3 = { hp: 30, atk: 31, def: 26, spa: 30, spd: 31, spe: 30 };

const CASES: Case[] = [
  {
    gen: "gen1",
    fixture: "",
    fieldClass: "manual_dv_input",
    values: [g1.atk, g1.spe, g1.def, g1.spc], // DOM order: Atk, Spe, Def, Spc
    expectReadout: `HP: ${hpDv(g1)} (from the other four)`,
    expectBits: { "player/team/0/dvAttack": g1.atk, "player/team/0/dvDefense": g1.def, "player/team/0/dvSpeed": g1.spe, "player/team/0/dvSpecial": g1.spc },
    expectValues: {
      "player/team.0.maxHp": gen12Stat(pika.hp, hpDv(g1), 0, 5, true),
      "player/team.0.hp": gen12Stat(pika.hp, hpDv(g1), 0, 5, true),
      "player/team.0.attack": gen12Stat(pika.atk, g1.atk, 0, 5, false),
      "player/team.0.defense": gen12Stat(pika.def, g1.def, 0, 5, false),
      "player/team.0.speed": gen12Stat(pika.spe, g1.spe, 0, 5, false),
      "player/team.0.special": gen12Stat(pika.spc, g1.spc, 0, 5, false),
    },
  },
  {
    gen: "gen2",
    fixture: join(REPO, "tools", "fixtures", "raw", "Pokemon Crystal - Deprecated Mapper", "c-wigglytuff-2-11311.fixture.jsonl.gz"),
    fieldClass: "manual_dv_input",
    values: [g2.atk, g2.spe, g2.def, g2.spc],
    expectReadout: `Hidden Power: ${gen2HiddenPower(g2).type} (${gen2HiddenPower(g2).power})`,
    expectBytes: { "patch/wStarterHiddenPowerType": [(g2.atk << 4) | g2.def], "patch/wOptionsHiddenPower": [(g2.atk << 4) | g2.def] },
    expectBits: { "player/team/0/dvAttack": g2.atk, "player/team/0/dvDefense": g2.def, "player/team/0/dvSpeed": g2.spe, "player/team/0/dvSpecial": g2.spc },
    expectValues: {
      "player/team.0.maxHp": gen12Stat(wig.hp, hpDv(g2), 0, 5, true),
      "player/team.0.attack": gen12Stat(wig.atk, g2.atk, 0, 5, false),
      "player/team.0.defense": gen12Stat(wig.def, g2.def, 0, 5, false),
      "player/team.0.specialAttack": gen12Stat(wig.spa, g2.spc, 0, 5, false),
      "player/team.0.specialDefense": gen12Stat(wig.spd, g2.spc, 0, 5, false),
      "player/team.0.speed": gen12Stat(wig.spe, g2.spe, 0, 5, false),
    },
  },
  {
    gen: "gen3",
    fixture: join(REPO, "tools", "fixtures", "gen3", "gen3-firered-smoke.fixture.jsonl.gz"),
    fieldClass: "manual_iv_input",
    values: [g3.hp, g3.atk, g3.def, g3.spa, g3.spd, g3.spe],
    expectReadout: `Hidden Power: ${gen3HiddenPower(g3).type} (${gen3HiddenPower(g3).power})`,
    expectBits: { "player/team/0/ivHp": g3.hp, "player/team/0/ivAttack": g3.atk, "player/team/0/ivDefense": g3.def, "player/team/0/ivSpeed": g3.spe, "player/team/0/ivSpecialAttack": g3.spa, "player/team/0/ivSpecialDefense": g3.spd },
  },
  {
    gen: "gen4",
    fixture: join(REPO, "tools", "fixtures", "gen4", "gen4-platinum-smoke.fixture.jsonl.gz"),
    fieldClass: "manual_iv_input",
    values: [g3.hp, g3.atk, g3.def, g3.spa, g3.spd, g3.spe],
    expectReadout: `Hidden Power: ${gen3HiddenPower(g3).type} (${gen3HiddenPower(g3).power})`,
  },
  {
    gen: "gen5",
    fixture: join(REPO, "tools", "fixtures", "gen5", "gen5-black-smoke.fixture.jsonl.gz"),
    fieldClass: "manual_iv_input",
    values: [g3.hp, g3.atk, g3.def, g3.spa, g3.spd, g3.spe],
    expectReadout: `Hidden Power: ${gen3HiddenPower(g3).type} (${gen3HiddenPower(g3).power})`,
  },
];

/** The one <select> whose options are exactly Automatic / Manual: the mode dropdown. */
const SELECT_MODE = `(() => {
  const selects = [...document.querySelectorAll("select")].filter((s) => {
    const o = [...s.options].map((x) => x.text.trim());
    return o.length === 2 && o[0] === "Automatic" && o[1] === "Manual";
  });
  if (selects.length !== 1) return "mode selects: " + selects.length;
  selects[0].value = "Manual";
  selects[0].dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()`;

function fillFields(cls: string, values: number[]): string {
  return `(() => {
    const inputs = [...document.querySelectorAll("input.${cls}")];
    if (inputs.length !== ${values.length}) return "fields: " + inputs.length;
    const values = ${JSON.stringify(values)};
    inputs.forEach((input, i) => { input.value = String(values[i]); input.dispatchEvent(new Event("change", { bubbles: true })); });
    return "ok";
  })()`;
}

/** The text of the settings block that holds the fields (its nearest ancestor with a few lines of text). */
const READOUT = `(() => {
  const input = document.querySelector("input.manual_iv_input, input.manual_dv_input");
  if (!input) return "no field";
  let node = input.parentElement;
  while (node && (node.innerText || "").length < 40) node = node.parentElement;
  return node ? node.innerText : "no block";
})()`;

let failures = 0;
const results: string[] = [];

for (const c of CASES) {
  if (only && !only.includes(c.gen)) continue;
  const fixture = c.gen === "gen1" ? gen1LabFixture() : c.fixture;
  const outDir = join(outRoot, c.gen);
  let readout = "";
  let mode = "";
  let fields = "";
  const result = await run({
    target: "unified",
    fixture,
    out: outDir,
    redirectPorts: true,
    screenshots: false,
    log: (m) => { if (/^\[run\] (unified|profile|--)/.test(m)) console.log(m); },
    beforeReplay: async (page: Page) => {
      mode = String(await page.evaluate(SELECT_MODE));
      await page.waitForTimeout(300);
      fields = String(await page.evaluate(fillFields(c.fieldClass, c.values)));
      await page.waitForTimeout(300);
      readout = String(await page.evaluate(READOUT));
      await page.screenshot({ path: join(outRoot, `${c.gen}-manual.png`) });
    },
  });
  const writes = JSON.parse(readFileSync(join(result.outDir, "writes.json"), "utf8")) as { endpoint: string; body: any }[];
  const problems: string[] = [];
  if (mode !== "ok") problems.push(`mode switch: ${mode}`);
  if (fields !== "ok") problems.push(`fields: ${fields}`);
  if (!readout.includes(c.expectReadout)) problems.push(`readout lacks "${c.expectReadout}":\n${readout}`);
  const bits: Record<string, number> = {};
  const values: Record<string, unknown> = {};
  const bytes: Record<string, number[]> = {};
  for (const w of writes) {
    if (w.endpoint === "set-properties-by-bits") for (const e of w.body) bits[e.path] = e.value;
    if (w.endpoint === "set-property-value") values[w.body.path] = w.body.value;
    if (w.endpoint === "set-property-bytes") bytes[w.body.path] = w.body.bytes;
  }
  for (const [path, v] of Object.entries(c.expectBits ?? {})) if (bits[path] !== v) problems.push(`bits ${path}: expected ${v}, got ${bits[path]}`);
  for (const [path, v] of Object.entries(c.expectValues ?? {})) if (values[path] !== v) problems.push(`value ${path}: expected ${v}, got ${values[path]}`);
  for (const [path, v] of Object.entries(c.expectBytes ?? {})) if (JSON.stringify(bytes[path]) !== JSON.stringify(v)) problems.push(`bytes ${path}: expected ${JSON.stringify(v)}, got ${JSON.stringify(bytes[path])}`);
  const profile = JSON.parse(readFileSync(join(result.outDir, "profile-check.json"), "utf8")) as { violations: string[] };
  for (const v of profile.violations) problems.push(`profile: ${v}`);
  const line = problems.length ? `FAIL  ${c.gen}: ${problems.join("; ")}` : `ok    ${c.gen}: readout "${c.expectReadout}", ${writes.length} writes, ${result.consoleErrors} console errors`;
  console.log(line);
  results.push(line);
  if (problems.length) failures++;
}

writeFileSync(join(outRoot, "summary.txt"), results.join("\n") + "\n");
console.log(`\n${failures ? failures + " case(s) failed" : "all cases passed"}; details under ${outRoot}`);
process.exit(failures ? 1 : 0);
