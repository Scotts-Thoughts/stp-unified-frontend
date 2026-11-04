import type { VoiceKeyword } from "../../../shared/voiceCommands";

/**
 * What each voice command does: the shortcut actions it runs (games/genN/actions.ts), the first
 * one the loaded generation has. A command is exactly the settings control a key would press,
 * so saving and watchers behave as for a click. Action ids are listed by
 * `npm run parity:action-ids -- --out=<file>`; `npm run parity:voice` checks that every
 * command finds one in every generation.
 */
export interface VoiceCommand {
    keyword: Exclude<VoiceKeyword, "wake">;
    /** What the button's tooltip says it did. */
    label: string;
    actions: readonly string[];
}

export const VOICE_COMMANDS: readonly VoiceCommand[] = [
    // gens 1-2 have DVs, not IVs.
    { keyword: "ivs", label: "Stats: IVs", actions: ["stats.set.ivs", "stats.set.dvs"] },
    { keyword: "evs", label: "Stats: EVs", actions: ["stats.set.evs"] },
    { keyword: "regular_stats", label: "Stats: Automatic", actions: ["stats.set.automatic"] },
    { keyword: "base_stats", label: "Stats: Base Stats", actions: ["stats.set.base_stats"] },
    // gens 2-3 keep Automatic's old id, from when it was "Battle Graphic".
    { keyword: "automatic_right_panel", label: "Right Panel: Automatic", actions: ["right_panel.set.automatic", "right_panel.set.battle_graphic"] },
    { keyword: "splits", label: "Right Panel: Splits", actions: ["right_panel.set.splits"] },
];

export function voiceCommand(keyword: VoiceKeyword): VoiceCommand | undefined {
    return VOICE_COMMANDS.find((c) => c.keyword === keyword);
}
