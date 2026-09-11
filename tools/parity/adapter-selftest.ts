/**
 * Self-test for the mapper translation layer (plan 1.4).
 *
 *   npm run parity:adapter
 *
 * Builds a property tree the way `GameHookMapperClient.loadMapper` does, from the
 * fixture's own property list, then checks what the canonical view promises:
 *
 *   1. every key a gen1 profile declares resolves to the *same object* the raw path
 *      resolves to -- the layer adds names, never copies;
 *   2. a child that only a dynamic access reaches (`badges['badge' + x]`,
 *      `battle[side][stat]`) is reachable through its aliased container;
 *   3. a key the profile does not declare is `undefined`, as an undeclared path was;
 *   4. a profile whose leaf contradicts its container fails loudly at build time;
 *   5. `registry`-style detection picks the right profile by path, then by identity,
 *      and nothing for a hack mapper (decision 8).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildCanonicalView, matchesIdentity, matchesPath, readIdentity, resolvePath } from "../../src/renderer/core/mapper/MapperAdapter";
import type { MapperProfile } from "../../src/renderer/core/mapper/MapperProfile";
import { PROFILES } from "../../src/renderer/games/profiles";

const REPO = join(import.meta.dirname, "..", "..");
const FIXTURE = join(REPO, "tools", "fixtures", "gen1", "gen1-yellow-smoke.fixture.jsonl.gz");

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
}

/** The client's `assign`: arrays for numeric segments, objects otherwise. */
function assign(target: any, path: string[], value: any): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in node)) node[key] = /^\d+$/.test(path[i + 1]) ? [] : {};
    node = node[key];
  }
  node[path[path.length - 1]] = value;
}

function loadTree(): { meta: any; properties: any; leaves: Map<string, any> } {
  const text = gunzipSync(readFileSync(FIXTURE)).toString("utf-8");
  const header = JSON.parse(text.split("\n")[0]);
  const properties: any = {};
  const leaves = new Map<string, any>();
  // Format 1 (tools/parity/lib/fixture.ts): `initial` is path -> full DTO.
  for (const p of Object.values(header.initial as Record<string, { path: string }>)) {
    const leaf = { ...p };
    leaves.set(p.path, leaf);
    assign(properties, p.path.split("."), leaf);
  }
  return { meta: header.meta, properties, leaves };
}

const { meta, properties, leaves } = loadTree();
const [yellow, redBlue] = PROFILES.gen1;
console.log(`fixture tree: ${leaves.size} properties, mapper ${meta.path}`);

// 1. identity: every declared key is the very object the raw path yields.
const view = buildCanonicalView(yellow, properties);
let same = 0;
let missing: string[] = [];
for (const [key, ref] of Object.entries(yellow.reads)) {
  const viaView = resolvePath(view, key);
  const viaRaw = resolvePath(properties, ref.path);
  if (viaRaw === undefined) missing.push(key);
  else if (viaView === viaRaw) same++;
}
check(`${same} of ${Object.keys(yellow.reads).length} declared keys resolve to the raw object`, same + missing.length === Object.keys(yellow.reads).length);
check(`keys absent from this mapper file: ${missing.length}`, true, missing.length ? missing.slice(0, 6).join(", ") + (missing.length > 6 ? " ..." : "") : "");

// 2. dynamic children through an aliased container.
check("player.badges.badge2 reachable through the aliased container", resolvePath(view, "player.badges.badge2") === leaves.get("player.badges.badge2"));
check("battle.enemyPokemon.modEnemyStageAttack reachable", resolvePath(view, "battle.enemyPokemon.modEnemyStageAttack") === leaves.get("battle.enemyPokemon.modEnemyStageAttack"));
check("player.team[0].move2pp reachable via the array index", (view as any).player?.team?.[0]?.move2pp === leaves.get("player.team.0.move2pp"));

// 3. undeclared namespace stays undefined.
check("a namespace the profile never mentions is absent", (view as any).noSuchNamespace === undefined);
check("a sibling leaf under a non-aliased container is absent", (view as any).gameTime?.noSuchField === undefined && (view as any).gameTime?.hours === leaves.get("gameTime.hours"));

// 4. contradiction: a leaf under an aliased container that maps elsewhere.
const contradictory: MapperProfile = {
  ...yellow,
  id: "test/contradiction",
  reads: {
    "player.badges": { path: "player.badges" },
    "player.badges.badge1": { path: "player.badges.badge2" },
  },
};
let threw = false;
try {
  buildCanonicalView(contradictory, properties);
} catch (e) {
  threw = /contradict|different object/i.test(String(e));
}
check("a contradictory profile throws at build time", threw);

// 5. detection.
check("yellow profile matches its /mapper meta.path", matchesPath(yellow, meta.path));
check("red/blue profile does not match yellow's path", !matchesPath(redBlue, meta.path));
check(`identity reads "${readIdentity(yellow.identity, properties, meta)}"`, readIdentity(yellow.identity, properties, meta) === "Yellow");
check("identity matches yellow, not red/blue", matchesIdentity(yellow, properties, meta) && !matchesIdentity(redBlue, properties, meta));
const hack = "DEPRECATED/gen1/pokemon_yellow_legacy.xml";
check("a hack mapper matches no gen1 profile by path", !PROFILES.gen1.some((p) => matchesPath(p, hack)));

console.log(failures ? `\nadapter self-test: ${failures} FAILURE(S)` : "\nadapter self-test: all checks passed");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(failures ? 1 : 0);
