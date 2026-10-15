/**
 * The faults box's rules, shared by every generation (core/overlay/player/FaultsBox.ts).
 */

/** What the faults box shows. The strings are the ones the overlays' templates always compared against. */
export type FaultMode = "None" | "Resets" | "Blackouts" | "Both";

export interface FaultModeOptions {
    /**
     * With no resets and no blackouts, show "None" (the box says "faults"). When false that case is "Resets"
     * (the box says "resets"), which is what gen5 did.
     */
    allowNone?: boolean;
}

/**
 * Which faults the box shows: one box ("faults", "resets" or "blackouts") until both counters are above zero,
 * then two. The loose comparisons are the ones the overlays always made (a counter read back from storage may be
 * a string).
 */
export function faultMode(resets: number, blackouts: number, { allowNone = true }: FaultModeOptions = {}): FaultMode {
    if (blackouts == 0 && resets == 0) return allowNone ? "None" : "Resets";
    if (blackouts == 0 && resets > 0) return "Resets";
    if (blackouts > 0 && resets == 0) return "Blackouts";
    return "Both";
}

/**
 * A faults count's font size: `sizes` is [up to 2 digits, 3 digits, 4 or more], in px. gen1's rule
 * (75 / 65 / 44 px), which keeps a long count inside its box.
 */
export function faultFontSize(value: unknown, sizes: readonly [number, number, number]): number {
    const digits = String(value).length;
    if (digits > 3) return sizes[2];
    if (digits > 2) return sizes[1];
    return sizes[0];
}
