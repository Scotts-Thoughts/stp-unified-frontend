/**
 * The 3DS games the overlay in this folder draws: X/Y and Omega Ruby/Alpha Sapphire (generation 6, this folder's
 * manifest) and Sun/Moon and Ultra Sun/Ultra Moon (generation 7, `games/gen7/manifest.ts`). One overlay, four
 * mappers: a pair shares one mapper, so the mapper's game name is the pair.
 *
 * Plain data with no Vue or app imports: the manifests, the profiles and the tools load it.
 */

export type ThreeDsGameName = "X and Y" | "Omega Ruby and Alpha Sapphire" | "Sun and Moon" | "Ultra Sun and Ultra Moon";

export type BadgeLayout = "case" | "row" | "stamps" | "none";

export interface ThreeDsGame {
    /** The mapper's `meta.game_name`, the data key, the splits folder and the style-file prefix. */
    name: ThreeDsGameName;
    generation: 6 | 7;
    /** The user-state section and module that plays it. */
    module: "gen6" | "gen7";
    /**
     * Where the frame pictures are (`<frames>/ui/...`, `<frames>/enemy-area/...`), made by tools/gen6/make-rounded-ui.py:
     * gen 6's round corners or gen 7's angled cuts with soft joins.
     */
    frames: "images/gen6" | "images/gen7";
    /** The badge pictures in order, under `images/`; gen 7 shows its four island trial stamps instead. */
    badges: readonly string[];
    /**
     * The badge box's shape (playerPanel.ts `badgeCellStyle`, `BADGE_BOX_DY`): "case" two rows of four big badges
     * like X/Y's badge case, "row" one row at gen 3's sizes in a box as short as gen 3's, "stamps" one row of four
     * big island stamps in gen 7's box as is, "none" gen 5's box as is.
     */
    badgeLayout: BadgeLayout;
    /**
     * Gen 7 only: picture n counts as won once this run has split n (the island's grand trial, the kahuna), because
     * the mappers have no trial flags. Without it, picture n is won when the mapper's `player.badges[n]` is true.
     */
    badgeSplits?: readonly string[];
    /**
     * The split list in the order the game is played, as the trainer's own name in battle memory. Kept to names:
     * the mappers have no trainer table for these games (their `trainers` reference is Platinum's).
     */
    splits: readonly string[];
    /** Winning this battle ends the run (the champion). */
    finalBattle: readonly string[];
    /** The splits after which the right panel switches to Splits ("Automatic Post-Battle Splits"). */
    postBattleSplits: readonly string[];
    /** The trainer classes a split's trainer may have; a namesake of another class is no split. Empty: any class. */
    splitClasses: readonly string[];
    /**
     * Splits that are not simply "a win against the trainer of that name" (gen 7): a trainer fought more than once,
     * where each fight is its own split, or a rival whose early fights are no split. Keyed by the split's name in
     * `splits` (which is what the panel, the CSV's trainer_name and the bookmark show). `splitFor` reads it.
     */
    splitRules?: Readonly<Record<string, SplitRule>>;
}

export interface SplitRule {
    /** The trainer's own name in battle memory, when the split's name is not it ("Hala (E4)" is "Hala"). */
    trainer?: string;
    /** The split counts only once one of these splits is in the run (E4 rematches, the champion after the E4). */
    afterAny?: readonly string[];
}

/** Gen 3's own badge row, cut out by tools/gen6/import-badges.py so the eight keep gen 3's sizes. */
const HOENN_BADGES = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `images/gen6/badges/hoenn/${n}.webp`);
const KALOS_BADGES = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `images/gen6/badges/kalos/${n}.webp`);
/** The island trial completion stamps, Melemele to Poni (tools/gen6/import-badges.py), won at each grand trial. */
const ALOLA_STAMPS = [0, 1, 2, 3].map((n) => `images/gen7/stamps/${n}.webp`);
const KAHUNAS = ["Hala", "Olivia", "Nanu", "Hapu"];

export const THREE_DS_GAMES: Record<ThreeDsGameName, ThreeDsGame> = {
    "X and Y": {
        name: "X and Y",
        generation: 6,
        module: "gen6",
        frames: "images/gen6",
        badges: KALOS_BADGES,
        badgeLayout: "case",
        splits: ["Viola", "Grant", "Korrina", "Ramos", "Clemont", "Valerie", "Olympia", "Wulfric", "Lysandre", "Wikstrom", "Malva", "Drasna", "Siebold", "Diantha"],
        finalBattle: ["Diantha"],
        postBattleSplits: ["Viola", "Grant", "Korrina", "Ramos", "Clemont", "Valerie", "Olympia", "Wulfric", "Diantha"],
        splitClasses: ["Leader", "Elite Four", "Champion", "Team Flare Boss", "Team Flare"],
    },
    "Omega Ruby and Alpha Sapphire": {
        name: "Omega Ruby and Alpha Sapphire",
        generation: 6,
        module: "gen6",
        frames: "images/gen6",
        badges: HOENN_BADGES,
        badgeLayout: "row",
        splits: ["Roxanne", "Brawly", "Wattson", "Flannery", "Norman", "Winona", "Tate&Liza", "Archie", "Maxie", "Wallace", "Sidney", "Phoebe", "Glacia", "Drake", "Steven"],
        finalBattle: ["Steven"],
        postBattleSplits: ["Roxanne", "Brawly", "Wattson", "Flannery", "Norman", "Winona", "Tate&Liza", "Wallace", "Steven"],
        // Tate and Liza are one trainer in OR/AS, "Leaders Liza & Tate" (gen 3 called them "Tate&Liza", the name
        // kept for the split, its icon and older split files).
        splitClasses: ["Leader", "Leaders", "Elite Four", "Champion", "Aqua Leader", "Magma Leader", "Team Aqua Leader", "Team Magma Leader"],
        splitRules: {
            "Tate&Liza": { trainer: "Liza & Tate" },
        },
    },
    "Sun and Moon": {
        name: "Sun and Moon",
        generation: 7,
        module: "gen7",
        frames: "images/gen7",
        badges: ALOLA_STAMPS,
        badgeLayout: "stamps",
        badgeSplits: KAHUNAS,
        // Hala and Olivia are kahunas and then Elite Four members: the second fight is its own split.
        splits: ["Hala", "Olivia", "Nanu", "Hapu", "Guzma", "Lusamine", "Hala (E4)", "Olivia (E4)", "Acerola", "Kahili", "Kukui"],
        finalBattle: ["Kukui"],
        postBattleSplits: ["Hala", "Olivia", "Nanu", "Hapu", "Kukui"],
        splitClasses: [],
        splitRules: {
            "Hala (E4)": { trainer: "Hala", afterAny: ["Hala", "Lusamine"] },
            "Olivia (E4)": { trainer: "Olivia", afterAny: ["Olivia", "Lusamine"] },
        },
    },
    "Ultra Sun and Ultra Moon": {
        name: "Ultra Sun and Ultra Moon",
        generation: 7,
        module: "gen7",
        frames: "images/gen7",
        badges: ALOLA_STAMPS,
        badgeLayout: "stamps",
        badgeSplits: KAHUNAS,
        // Olivia is a kahuna and then an Elite Four member. Hau is the rival all game and the first challenger for the
        // title: only a Hau fight after an Elite Four win is the split (and ends the run).
        splits: ["Hala", "Olivia", "Nanu", "Hapu", "Guzma", "Lusamine", "Molayne", "Olivia (E4)", "Acerola", "Kahili", "Hau"],
        finalBattle: ["Hau"],
        postBattleSplits: ["Hala", "Olivia", "Nanu", "Hapu", "Hau"],
        splitClasses: [],
        splitRules: {
            "Olivia (E4)": { trainer: "Olivia", afterAny: ["Olivia", "Lusamine"] },
            "Hau": { afterAny: ["Molayne", "Olivia (E4)", "Acerola", "Kahili"] },
        },
    },
};

/** The trainer in battle memory behind a split name: `splitRules`' `trainer`, or the name itself. */
export function splitTrainer(game: ThreeDsGame, split: string): string {
    return game.splitRules?.[split]?.trainer ?? split;
}

/**
 * A trainer name for comparing: case and spaces dropped, and a pair's two names ("Liza & Tate") in a fixed order, so
 * "Tate&Liza", "Tate & Liza" and "Liza & Tate" are one trainer.
 */
function sameTrainerKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "").split("&").sort().join("&");
}

/**
 * The split a win against `trainer` is, given the splits already in the run (`done`), or null for none.
 *
 * The candidates are the splits whose trainer is `trainer` and whose `afterAny` (if any) is met. The latest of them
 * not yet done is the one: Hala before Lusamine is the kahuna, Hala after the kahuna (or after Lusamine) the Elite
 * Four. When all of them are done, the latest again, so a further win writes another row as before (Guzma).
 */
export function splitFor(game: ThreeDsGame, trainer: string, done: ReadonlySet<string>): string | null {
    const candidates = game.splits.filter((split) => {
        if (sameTrainerKey(splitTrainer(game, split)) !== sameTrainerKey(trainer)) return false;
        const after = game.splitRules?.[split]?.afterAny;
        return !after || after.some((other) => done.has(other));
    });
    if (!candidates.length) return null;
    return [...candidates].reverse().find((split) => !done.has(split)) ?? candidates[candidates.length - 1];
}

export const GEN6_GAMES: readonly ThreeDsGameName[] = ["X and Y", "Omega Ruby and Alpha Sapphire"];
export const GEN7_GAMES: readonly ThreeDsGameName[] = ["Sun and Moon", "Ultra Sun and Ultra Moon"];

export function threeDsGame(name: unknown): ThreeDsGame | null {
    return typeof name === "string" && name in THREE_DS_GAMES ? THREE_DS_GAMES[name as ThreeDsGameName] : null;
}

/** The game a section's saved edition stands for, or the module's first game. */
export function gameOrDefault(name: unknown, module: "gen6" | "gen7"): ThreeDsGame {
    const game = threeDsGame(name);
    if (game && game.module === module) return game;
    return THREE_DS_GAMES[(module === "gen6" ? GEN6_GAMES : GEN7_GAMES)[0]];
}
