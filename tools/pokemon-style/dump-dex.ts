// Rebuilds data/dex.json (species, first type and family for every game) from the overlay's Pokedex tables.
// Run when a game's species list changes:  npx tsx tools/pokemon-style/dump-dex.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const R = join(HERE, "..", "..", "src", "renderer");
const load = (p: string) => import(pathToFileURL(join(R, p)).href);
const pick = (dex: any) =>
    Object.fromEntries(
        Object.entries(dex).map(([k, v]: any) => [
            k,
            {
                t1: v.type_1 ?? v.types?.[0],
                t2: v.type_2 ?? v.types?.[1],
                fam: (v.evolution_family ?? []).map((m: any) => m.species ?? m),
                dexno: v.national_dex_number ?? v.dex_number ?? v.id,
            },
        ]),
    );
const first = (m: any) => Object.values(m)[0];

const out: Record<string, unknown> = {};
out["gen1|Yellow"] = pick(first(await load("data/pokedex/YellowDex.ts")));
out["gen1|Red and Blue"] = pick(first(await load("data/pokedex/RedAndBlueDex.ts")));
out["gen2|Crystal"] = pick((await load("games/gen2/data/pokemon_crystal.js")).dexDataCrystal);
out["gen3|Emerald"] = pick((await load("games/gen3/data/pokedex/emerald.js")).pokedex_emerald);
out["gen3|FireRed and LeafGreen"] = pick(first(await load("games/gen3/data/pokedex/firered_leafgreen.js")));
for (const [g, f] of [["Diamond and Pearl", "diamond_pearl"], ["Platinum", "platinum"], ["HeartGold and SoulSilver", "heartgold_soulsilver"]]) {
    out[`gen4|${g}`] = pick(first(await load(`games/gen4/data/pokedex/${f}.js`)));
}
for (const [games, f] of [[["Black", "White"], "black_white"], [["Black 2", "White 2"], "black2_white2"]] as const) {
    const dex = pick(first(await load(`games/gen5/data/pokedex/${f}.js`)));
    for (const g of games) out[`gen5|${g}`] = dex;
}
writeFileSync(join(HERE, "data", "dex.json"), JSON.stringify(out));
for (const k in out) console.log(k, Object.keys(out[k] as object).length);
