/**
 * A module's `styles()` text from several `?inline` sheets, in order: the shared ones first, then the generation's
 * own `style.css`. `core/styles/shared-gen345.css` and `shared-gen45.css` (written by tools/css/share-css.ts) hold the
 * rules gens 3-5 had byte-identical and write the generation's class as `.gen-N`; it becomes `genClass` here, so every
 * selector reads exactly as it did in the generation's sheet.
 */
export async function joinStyleSheets(genClass: string, sheets: Promise<{ default: string }>[]): Promise<string> {
    const texts = await Promise.all(sheets);
    return texts.map((m) => m.default.replace(/\.gen-N(?![\w-])/g, `.${genClass}`)).join("\n");
}
