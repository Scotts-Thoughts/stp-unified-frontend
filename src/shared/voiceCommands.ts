/**
 * What voice control listens for (ARCHITECTURE §2 "voice"). The speech model
 * (src/main/voice/worker.ts) writes down what it hears, in capitals and with no punctuation, and
 * findVoiceKeywords looks through that text for "Hey Rotom" and the commands. The text is never
 * saved or sent anywhere. To add a command, add a pattern here, then say what it runs in the
 * renderer's `core/voice/commands.ts`, and add what the model really wrote to `HEARD_EXAMPLES`
 * in `tools/parity/voice-selftest.ts`.
 *
 * The patterns are written from what the model really wrote, not from how the words are spelled.
 * "Rotom" isn't a word it knows, and neither are "IVs", "EVs" or "DVs": "show IVs" comes out as
 * SHOW IVIES or SHOW IVIZ, "show EVs" as SHOWY VIZ or SHOW YEVIZ (the W of "show" runs into the
 * "ee"). A wrong command is worse than a missed one, so a spelling that could be either one stays
 * out: SHOEVIZ came up for both IVs and EVs, so it matches nothing and the user says it again
 * (SHROIVIZ likewise).
 */

export type VoiceKeyword = "wake" | "ivs" | "evs" | "regular_stats" | "base_stats" | "automatic_right_panel" | "splits";

/** The end of "IVs", "EVs" and "DVs": VIES, VIZ, VISE, VYS, VS, V S, VHES, VIVIZ... */
const VEES = String.raw`V(?:IV)?H?[IEY]*\s?[SZ]E?\b`;

/** The "Rotom" part of the wake phrase, after "Hey". */
const ROTOM = String.raw`W?RH?O\s?[TDM][A-Z]*(?:\s(?:TOM|HIM|EM|AM|UM|HOME))?\b`;

const PATTERNS: { keyword: VoiceKeyword; pattern: RegExp }[] = [
    // Loose on purpose: a wake phrase heard by mistake changes nothing unless a command follows.
    { keyword: "wake", pattern: new RegExp(String.raw`\b(?:HEY|HAY|HE|HA)\s?${ROTOM}`, "g") },
    // "Rotom" alone, spelled closely enough that "Hey" isn't needed to be sure of it.
    { keyword: "wake", pattern: /\bI?RH?O[TD][OAEU]M\b/g },
    // gens 1-2 call IVs DVs: both are the "ivs" command, which runs whichever the game has.
    { keyword: "ivs", pattern: new RegExp(String.raw`\bSHOW\s(?:I|AI|EYE|A)\s?${VEES}`, "g") },
    { keyword: "ivs", pattern: new RegExp(String.raw`\bSHOI\s?${VEES}`, "g") },
    { keyword: "ivs", pattern: new RegExp(String.raw`\bSHOW\s?D(?:EE?|I|Y)?\s?${VEES}`, "g") },
    { keyword: "evs", pattern: new RegExp(String.raw`\b(?:SHOWY|SHOY|SHY)\s(?:Y?E+\s?)*${VEES}`, "g") },
    { keyword: "evs", pattern: new RegExp(String.raw`\bSHOW\s(?:Y?E+\s?)+${VEES}`, "g") },
    { keyword: "regular_stats", pattern: /\bSHOW\sREGULAR\sSTAT[A-Z]*/g },
    { keyword: "base_stats", pattern: /\bSHOW\s(?:BASE|BAY|BAS)\s?S?T[AE][A-Z]*S\b/g },
    { keyword: "automatic_right_panel", pattern: /\bRES(?:ET|ENT)\s(?:RIGHT|WRITE)\sPANEL\b/g },
    { keyword: "splits", pattern: /\bSHOW\sSPLIT[SZ]?\b/g },
];

/** The model's text in the form the patterns expect: capitals, single spaces, no apostrophes. */
export function normalizeHeard(text: string): string {
    return text.toUpperCase().replace(/'/g, "").replace(/\s+/g, " ").trim();
}

/** What a stretch of normalized text says, in the order it was said, and where the last one ends. */
export function findVoiceKeywords(text: string): { keywords: VoiceKeyword[]; end: number } {
    const found = PATTERNS.flatMap(({ keyword, pattern }) =>
        [...text.matchAll(pattern)].map((m) => ({ keyword, start: m.index, end: m.index + m[0].length })),
    ).sort((a, b) => a.start - b.start);
    const keywords: VoiceKeyword[] = [];
    let end = 0;
    for (const match of found) {
        if (match.start < end) continue;
        keywords.push(match.keyword);
        end = match.end;
    }
    return { keywords, end };
}

/** Main to renderer: what the voice thread is doing, or what it heard. */
export type VoiceEvent =
    | { type: "ready" }
    | { type: "heard"; keyword: VoiceKeyword }
    | { type: "error"; message: string };
