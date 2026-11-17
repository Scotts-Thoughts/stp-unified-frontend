/**
 * The enemy panel's trainer header when it is too long for one line (all five generations, Scott 2026-11-17): the
 * trainer class is dropped and the name kept, so "Pokemon Trainer Bianca's Team" reads "Bianca's Team". A header that
 * fits is shown as it is.
 *
 * `chars` is what fits in the generation's header at its normal size (the font is the same width per character
 * everywhere, about 0.67 of its size): gen1 20 (380px at 28px), gen2 23 (400px at 26px), gen3 20 (338px at 24px),
 * gens 4-5 24 (420px at 26px). Two-trainer headers are shrunk instead (`twoTrainerHeaderStyle`).
 */
export function fitTrainerHeader(header: unknown, chars: number): unknown {
    if (typeof header !== "string" || header.length <= chars) return header;
    const [, base, suffix] = /^(.*?)((?:'s)? Team)?$/.exec(header) ?? [header, header, ""];
    // "Lea & Jed": both names. Otherwise the last word with a letter in it and what follows it ("Terry 6").
    const pair = /\S+ & \S+$/.exec(base);
    const name = pair ? pair[0] : /[^\s]*[A-Za-zÀ-ɏ][^\s]*(?:\s+[^A-Za-zÀ-ɏ\s]+)*$/.exec(base)?.[0];
    if (!name || name === base) return header;
    return name + (suffix ?? "");
}
