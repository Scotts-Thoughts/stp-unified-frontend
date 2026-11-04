/**
 * The phrases voice control listens for (ARCHITECTURE §2 "voice"). The keyword spotter
 * (src/main/voice/worker.ts) only hears these; nothing else that is said is written down.
 *
 * `tokens` is the phrase spelled in the model's word pieces (resources/voice/), which is what
 * the spotter takes. To add a phrase, spell it with `tools/voice/tokenize.py "show movepool"`
 * and add a line here; then the renderer's `core/voice/commands.ts` says what it runs.
 *
 * Tuning, appended to the tokens: `:3.0` boosts the phrase (makes it easier to hear), `#0.05`
 * lowers the confidence it needs (default 0.25). The wake phrase has both: "Rotom" is not an
 * English word, and the model heard it in only one of two test voices without them. A command
 * only runs within a few seconds of the wake phrase, so a wrongly heard wake phrase alone
 * changes nothing. Measured 2026-10-31 on text-to-speech clips played back to back:
 * 2.5/0.1 heard "Hey Rotom" + command 81%, 3.0/0.05 93%, 4.0/0.03 79%; none of them fired on
 * six minutes of chatter. A real voice is the real test: re-tune here once one has been tried.
 */

export type VoiceKeyword = "wake" | "ivs" | "evs" | "regular_stats" | "base_stats" | "automatic_right_panel" | "splits";

export interface VoicePhrase {
    keyword: VoiceKeyword;
    /** What the user says. */
    said: string;
    tokens: string;
    /** `:boost #threshold`, or empty for the defaults. */
    tuning?: string;
}

export const VOICE_PHRASES: VoicePhrase[] = [
    { keyword: "wake", said: "Hey Rotom", tokens: "▁HE Y ▁RO T OM", tuning: ":3.0 #0.05" },
    { keyword: "wake", said: "Hey Rotum", tokens: "▁HE Y ▁RO T UM", tuning: ":3.0 #0.05" },
    // Said letter by letter; gens 1-2 call IVs DVs. A one-word spelling as well ("▁SHOW ▁E V S")
    // made "E V S" be heard as IVs on test clips, and a wrong command is worse than a missed one.
    { keyword: "ivs", said: "Show I V S", tokens: "▁SHOW ▁I ▁ V ▁S" },
    { keyword: "ivs", said: "Show D V S", tokens: "▁SHOW ▁ D ▁ V ▁S" },
    { keyword: "evs", said: "Show E V S", tokens: "▁SHOW ▁E ▁ V ▁S" },
    { keyword: "regular_stats", said: "Show regular stats", tokens: "▁SHOW ▁RE G UL AR ▁STA T S" },
    { keyword: "base_stats", said: "Show base stats", tokens: "▁SHOW ▁BA SE ▁STA T S" },
    { keyword: "automatic_right_panel", said: "Show automatic right panel", tokens: "▁SHOW ▁A U T OM A TIC ▁RIGHT ▁PA N EL" },
    { keyword: "splits", said: "Show splits", tokens: "▁SHOW ▁SP LI T S" },
];

/** The spotter's keywords text: one phrase per line, `tokens [tuning] @keyword`. */
export function spotterKeywords(phrases: VoicePhrase[] = VOICE_PHRASES): string {
    return phrases.map((p) => [p.tokens, p.tuning, `@${p.keyword}`].filter(Boolean).join(" ")).join("\n");
}

/** Main to renderer: what the voice thread is doing, or what it heard. */
export type VoiceEvent =
    | { type: "ready" }
    | { type: "heard"; keyword: VoiceKeyword }
    | { type: "error"; message: string };
