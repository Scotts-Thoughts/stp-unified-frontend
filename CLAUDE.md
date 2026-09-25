# CLAUDE.md

## Game decompilation repos (reference)

Local checkouts of the Pokémon disassembly/decompilation projects. Consult these
when you need ground truth about actual game behaviour, memory layout, data
structures, or constants — do not guess at game internals when the source is here.
These are read-only references; never modify them.

| Gen | Games | Path |
| --- | --- | --- |
| 1 | Red & Blue | `A:\Cygwin\home\scott\pokered` |
| 1 | Yellow | `A:\Cygwin\home\scott\pokeyellow` |
| 2 | Gold & Silver | `A:\Cygwin\home\scott\pokegold` |
| 2 | Crystal | `A:\Cygwin\home\scott\pokecrystal` |
| 3 | Ruby & Sapphire | `A:\decomps\pokeruby` |
| 3 | Emerald | `A:\decomps\pokeemerald` |
| 3 | FireRed & LeafGreen | `A:\decomps\pokefirered` |
| 4 | Diamond & Pearl | `A:\Dropbox\stp-projects\programs\poke_map\repos\pokediamond` |
| 4 | Platinum | `A:\decomps\pokeplatinum` |
| 4 | HeartGold & SoulSilver | `A:\Dropbox\stp-projects\programs\poke_map\repos\pokeheartgold` |

Gen 1/2 repos are asm (rgbds); Gen 3 is C (agbcc); Gen 4 is C (ARM/NDS).

## Legacy quirks: which to keep and which to fix

The five legacy overlays carry quirks of two kinds, and they are treated differently (plan decision 25,
2026-09-25; the ledger is `docs/known-legacy-bugs.md`):

- **Game quirks** -- anything that mirrors a feature of the game, the game's own code, or how the game presents
  information -- are kept exactly. Check the decompilations above before touching one. Example: gen2's Special
  Defense badge boost applies only when the unboosted Special Attack is 206-432 or 661+, because pokecrystal's
  `BadgeStatBoosts` does exactly that; no other generation has it, and the overlay must keep it.
- **Code quirks** -- inconsistencies that exist only because the five apps were written at different stages (a
  typo'd storage key, a guard present in one generation and missing in another, a throw on an undefined fallback,
  duplicated helpers with drifted spellings) -- are technical debt. Streamline and standardise them whenever
  possible: move the code verbatim first, fix the quirk in its own commit after, verify both with the parity
  harness (`docs/parity-harness.md`), and record the fix in `docs/known-legacy-bugs.md`.

When it is unclear whether a quirk is the game's or the code's, the decompilation decides: if the game does it,
keep it.
