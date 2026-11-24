/**
 * The weather turn box (gens 2-5): which weather is up and how many turns it has left, e.g. "rain" over "4".
 *
 * Each generation reads its own mapper and hands over the weather's name, the turn counter and whether the weather
 * is counting down at all. The box shows only while a move's weather is ticking down: permanent weather (Drizzle,
 * Drought, Sand Stream, Snow Warning, overworld rain) never runs out, and its counter is stale, so it stays hidden.
 * Fog has no counter. Weather lasts 5 turns, or 8 with Damp Rock, Heat Rock, Smooth Rock or Icy Rock (gens 4-5);
 * anything outside 1-8 is a value read before the battle set it (gen5 reads 255 at battle start).
 */

const WEATHER_LABELS = new Set(["rain", "sun", "sandstorm", "hail"]);

export const WEATHER_MAX_TURNS = 8;

export interface WeatherTurns {
    shown: boolean;
    /** The weather's name, lowercase ("rain", "sun", "sandstorm", "hail"); "weather" while hidden. */
    label: string;
    /** Turns left, or null while hidden. */
    value: number | null;
}

/**
 * @param weather the mapper's weather name: "Rain", "Sun", "Sandstorm" or "Hail" (any case); anything else hides.
 * @param turns the weather's turn counter.
 * @param ticking false while the weather is permanent (the generation's permanent bit is set).
 */
export function weatherTurns(weather: unknown, turns: unknown, ticking = true): WeatherTurns {
    const name = typeof weather == "string" ? weather.trim().toLowerCase() : "";
    const count = Number(turns);
    if (!WEATHER_LABELS.has(name) || !ticking || !Number.isInteger(count) || count < 1 || count > WEATHER_MAX_TURNS) {
        return { shown: false, label: "weather", value: null };
    }
    return { shown: true, label: name, value: count };
}
