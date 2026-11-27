#!/usr/bin/env node
/**
 * Builds the compact per-game data the damage calculator reads
 * (src/renderer/core/damage/data/<slug>.json) from data_objects, the same source
 * Matchup Planner and Solodex use. The overlay's own move tables can't feed the
 * engine: gens 2 and 4 have no move effects, and the spellings differ per table.
 *
 *   node tools/damage/build-data.mjs [path/to/data_objects-main]
 *
 * Default source: A:\Programs\solodex\data_objects-main (or $DATA_OBJECTS). On the
 * Mac pass the path. Re-run it when data_objects' moves or Pokédex change, then
 * commit the JSON (the app never reads data_objects itself).
 *
 * Each file: { game, gen, moves: { name: MoveData without description }, species:
 * { name: { types, base, weight, evolves } } }. Names are data_objects' modern
 * spellings; core/damage/data.ts looks them up loosely (case, spaces and
 * punctuation ignored, plus the old spellings below), so "ThunderPunch" and
 * "Faint Attack" in a frontend table still find their move.
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.resolve(process.argv[2] ?? process.env.DATA_OBJECTS ?? 'A:/Programs/solodex/data_objects-main')
const OUT = path.join(ROOT, 'src', 'renderer', 'core', 'damage', 'data')
const load = async (rel) => import(pathToFileURL(path.join(SRC, rel)).href)

/** Overlay edition `game` names (games/genN/manifest.ts) → the data_objects Pokédex. */
const GAMES = [
  { slug: 'red-blue', gen: 1, dex: ['pokedex.js', 'Red and Blue'] },
  { slug: 'yellow', gen: 1, dex: ['pokedex.js', 'Yellow'] },
  { slug: 'gold-silver', gen: 2, dex: ['pokedex.js', 'Gold and Silver'] },
  { slug: 'crystal', gen: 2, dex: ['pokedex.js', 'Crystal'] },
  { slug: 'emerald', gen: 3, dex: ['pokedex.js', 'Emerald'] },
  { slug: 'firered-leafgreen', gen: 3, dex: ['pokedex.js', 'FireRed and LeafGreen'] },
  { slug: 'diamond-pearl', gen: 4, dex: ['pokedex.js', 'Diamond and Pearl'] },
  { slug: 'platinum', gen: 4, dex: ['pokedex.js', 'Platinum'] },
  { slug: 'heartgold-soulsilver', gen: 4, dex: ['pokedex.js', 'HeartGold and SoulSilver'] },
  { slug: 'black-white', gen: 5, dex: ['pokedex/black_white.js'] },
  { slug: 'black2-white2', gen: 5, dex: ['pokedex/black2_white2.js'] },
]

/** Per-game move fixes data_objects keeps outside the gen table (Matchup Planner MOVE_GAME_OVERRIDES). */
const MOVE_GAME_OVERRIDES = { 'diamond-pearl': { Hypnosis: { accuracy: 70 } } }

const { moves: allMoves } = await load('moves.js')
const sharedDex = (await load('pokedex.js')).pokedex

fs.mkdirSync(OUT, { recursive: true })
for (const g of GAMES) {
  const rawDex = g.dex[1] ? sharedDex[g.dex[1]] : (await load(g.dex[0])).pokedex
  if (!rawDex) throw new Error(`no Pokédex for ${g.slug}`)
  const moves = {}
  for (const [name, data] of Object.entries(allMoves[String(g.gen)])) {
    if (data.type === 'Shadow') continue
    const { description, ...rest } = data
    moves[name] = { ...rest, ...(MOVE_GAME_OVERRIDES[g.slug]?.[name] ?? {}) }
  }
  // A species can evolve when its family lists a later member with an evolution method (Eviolite, Gen 5).
  const species = {}
  for (const [name, d] of Object.entries(rawDex)) {
    const fam = d.evolution_family ?? []
    const i = fam.findIndex((e) => e.species === d.species)
    const evolves = i >= 0 && fam.slice(i + 1).some((e) => e.method != null)
    species[name] = { types: [d.type_1, d.type_2 || d.type_1], base: d.base_stats, weight: d.weight ?? 0, evolves }
  }
  const file = path.join(OUT, `${g.slug}.json`)
  fs.writeFileSync(file, JSON.stringify({ gen: g.gen, moves, species }) + '\n')
  console.log(`${g.slug}: ${Object.keys(moves).length} moves, ${Object.keys(species).length} species, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`)
}
