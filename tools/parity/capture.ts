/**
 * Capture: everything one checkpoint contributes to the nine oracles.
 *
 * Oracles 1, 2, 4 and 9 are read out of the renderer here; 3, 5, 6, 7 and 8 are
 * collected by the runner from the sandbox and the stubs. A capture is a directory:
 *
 *   <capture>/styles.json     element path -> computed styles + bounding rect
 *   <capture>/screen.png      1920x1080 content screenshot
 *   <capture>/storage.json    localStorage dump (gen2-5 keep everything there)
 *   <capture>/console.json    console.error + uncaught exceptions since the last capture
 *   <capture>/meta.json       checkpoint id, fixture time, frame, app target
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";

/** Properties whose value is a Chromium build detail, not a parity claim. */
const SKIP_PROPERTIES = new Set([
  "-webkit-locale",
  "perspective-origin",
  "transform-origin",
  "webkit-locale",
]);

export interface StyleEntry {
  rect: [x: number, y: number, w: number, h: number];
  text: string | null;
  styles: Record<string, string>;
}

export interface ConsoleEntry {
  type: string;
  text: string;
}

export interface CaptureMeta {
  checkpoint: string;
  target: string;
  fixture: string;
  tMs: number;
  frame: number;
  elements: number;
  capturedAt: string;
}

/**
 * Collects computed styles and layout rects for every element under `#app-container`.
 *
 * The key is a path built from tag + class list + nth-child, which survives the move
 * from Vue 3.2 runtime templates to 3.5 SFCs (the DOM shape is the parity claim; the
 * component that produced it is not).
 */
export async function captureStyles(page: Page): Promise<Record<string, StyleEntry>> {
  return await page.evaluate((skip: string[]) => {
    const skipSet = new Set(skip);
    const out: Record<string, StyleEntry> = {};

    const keyOf = (el: Element): string => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node.id !== "app-container") {
        const parent: Element | null = node.parentElement;
        const index = parent ? Array.prototype.indexOf.call(parent.children, node) + 1 : 1;
        const classes = node.classList.length ? "." + [...node.classList].sort().join(".") : "";
        parts.unshift(`${node.tagName.toLowerCase()}${classes}:nth-child(${index})`);
        node = parent;
      }
      return parts.join(" > ");
    };

    // "0px" and "0" or "auto" and "" mean the same thing in different Chromium builds.
    const normalise = (value: string): string => {
      const v = value.trim();
      if (v === "" || v === "auto" || v === "normal" || v === "none") return v;
      return v.replace(/\b0px\b/g, "0").replace(/\s+/g, " ");
    };

    const root = document.getElementById("app-container");
    if (!root) return out;

    for (const el of [root, ...root.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);
      const styles: Record<string, string> = {};
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        if (skipSet.has(prop)) continue;
        styles[prop] = normalise(cs.getPropertyValue(prop));
      }
      const r = el.getBoundingClientRect();
      // Only leaf text is compared; an ancestor's textContent would repeat every child.
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? "").trim())
        .filter(Boolean)
        .join(" ");
      out[keyOf(el)] = {
        rect: [round(r.x), round(r.y), round(r.width), round(r.height)],
        text: ownText || null,
        styles,
      };
    }
    return out;

    function round(n: number): number {
      // Sub-hundredth-pixel jitter is sub-pixel rendering noise, not a layout change.
      return Math.round(n * 100) / 100;
    }
  }, [...SKIP_PROPERTIES]);
}

/** localStorage as the legacy apps leave it. Empty in the unified app (decision 10). */
export async function captureLocalStorage(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) out[key] = localStorage.getItem(key) ?? "";
      }
    } catch {
      /* a renderer without storage access returns {} */
    }
    return out;
  });
}

export interface CaptureInput {
  page: Page;
  dir: string;
  meta: Omit<CaptureMeta, "elements" | "capturedAt">;
  console: ConsoleEntry[];
  /** Screenshots dominate run time; skip them while iterating on other oracles. */
  screenshot?: boolean;
}

export async function capture(input: CaptureInput): Promise<CaptureMeta> {
  const { page, dir, meta } = input;
  mkdirSync(dir, { recursive: true });

  const styles = await captureStyles(page);
  writeFileSync(join(dir, "styles.json"), JSON.stringify(styles, null, 1));
  writeFileSync(join(dir, "storage.json"), JSON.stringify(await captureLocalStorage(page), null, 1));
  writeFileSync(join(dir, "console.json"), JSON.stringify(input.console, null, 1));
  if (input.screenshot !== false) {
    await page.screenshot({ path: join(dir, "screen.png"), animations: "disabled" });
  }

  const full: CaptureMeta = {
    ...meta,
    elements: Object.keys(styles).length,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(full, null, 1));
  return full;
}

/**
 * tsx compiles with esbuild's `keepNames`, which wraps every named function in a
 * `__name(...)` helper. Playwright serialises an evaluate callback to source and runs
 * it in the renderer, where that helper does not exist, so every page.evaluate with a
 * nested function would throw `ReferenceError: __name is not defined`. The shim is
 * injected as a *string* (never compiled) both into the current document and into
 * every future one.
 */
export async function installEvalShims(page: Page): Promise<void> {
  const shim = "globalThis.__name = globalThis.__name || function (fn) { return fn; };";
  await page.addInitScript({ content: shim });
  await page.evaluate(shim).catch(() => {
    /* the document may not be ready yet; the init script covers the next navigation */
  });
}

/**
 * Settle before a capture: advance the paused virtual clock past the longest debounce
 * any overlay uses (gen4's 10-frame client debounce, the 250/500/1000 ms storage saves,
 * every CSS transition), then let two more frames render.
 *
 * With the clock paused, `requestAnimationFrame` only fires when the clock moves, so
 * "wait for two frames" is spelled as "advance 32 ms", not as an rAF promise -- an rAF
 * promise would wait forever. The two round trips in between let Vue flush its render
 * queue, which runs as a microtask after the frame callback.
 *
 * The total advance is exactly `virtualMs`, so the caller's clock accounting stays right.
 */
export async function settle(page: Page, virtualMs = 1200): Promise<void> {
  const twoFrames = 32;
  await page.clock.runFor(Math.max(0, virtualMs - twoFrames));
  await page.evaluate("0");
  await page.clock.runFor(Math.min(virtualMs, twoFrames));
  await page.evaluate("0");
}
