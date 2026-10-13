import { firstMatchIndex } from "~/core/logic/firstMatchIndex";

interface Gen3Move {
    Move: string;
}

/** `gen3moves.find(x => x.Move.toLowerCase() === name)`, with `name` already lower-cased. */
export const gen3MoveByLowerName = firstMatchIndex<Gen3Move>((m) => m.Move.toLowerCase());

/** `gen3moves.find(m => m.Move.toUpperCase().replace(/[^A-Z]/g, "") == key)`: letters only, upper case. */
export const gen3MoveByLetters = firstMatchIndex<Gen3Move>((m) => m.Move.toUpperCase().replace(/[^A-Z]/g, ""));
