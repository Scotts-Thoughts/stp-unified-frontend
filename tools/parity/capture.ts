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
  /**
   * `Date.now()` inside the renderer at capture time -- the *virtual* clock, not the
   * wall clock. Two runs of the same fixture must agree on it: everything the overlay
   * time-stamps (the on-screen timer, CSV durations, battle lengths) is derived from
   * it, so a drift here is the root cause of a whole class of oracle-1 diffs, and this
   * is where it is visible. `diff.ts` compares it.
   */
  virtualNow: number;
  /**
   * Hub frames the renderer had processed when the capture was taken.
   *
   * The companion to `virtualNow`: together they say "the same clock, and the same
   * amount of mapper input". If the two runs agree on both and still render different
   * text, the difference is in the renderer's own scheduling and not in what the
   * harness fed it.
   */
  hubRx: number;
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
  meta: Omit<CaptureMeta, "elements" | "virtualNow" | "hubRx" | "capturedAt">;
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
    virtualNow: Number(await page.evaluate("Date.now()")),
    hubRx: Number(await page.evaluate("window.__hubRx || 0")),
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
  await finishAnimations(page);
  await flushRender(page);
}

/**
 * A real task boundary in the renderer, which drains every pending microtask.
 *
 * Vue writes the DOM from a microtask queued by the reactive update, so the text a
 * capture reads is only current once that queue has drained. `page.evaluate` is not
 * enough on its own: it resolves over CDP, and whether the render job ran before the
 * reply was serialised is a matter of real-time luck -- which is exactly how the
 * on-screen timer's hundredths digit ended up one frame stale in one run out of
 * several, tripping oracles 1 and 2 on a fixture that is otherwise deterministic.
 *
 * `MessageChannel` is the primitive to use because `page.clock` does not fake it: a
 * faked `setTimeout(0)` would never fire while the clock is paused, and a microtask
 * chain cannot outlast the microtask queue it is queued on.
 */
export async function flushRender(page: Page): Promise<void> {
  await page.evaluate(
    "new Promise(function (resolve) {" +
      "  var ch = new MessageChannel();" +
      "  ch.port1.onmessage = function () { resolve(); };" +
      "  ch.port2.postMessage(0);" +
      "})",
  );
}

/**
 * Runs every CSS transition and animation to its end state.
 *
 * `page.clock` fakes JS timers; it does not touch the compositor, and CSS transitions
 * run on real time. gen2's battle graphic fades in over a `<transition>`, and a
 * capture taken mid-fade recorded `opacity: 0.668895` in one run and `0.768907` in the
 * next -- real time between two runs is never the same. `page.screenshot({animations:
 * "disabled"})` already fast-forwards finite animations, but only after the styles were
 * read, and not at all with --no-screenshots. So every capture settles them first,
 * which makes the captured state "what the transition ends on", the same for the
 * legacy app and the unified one. `transitionend` fires as a result, which is what Vue
 * waits for to drop its `-enter-active` classes -- also the same on both sides.
 */
export async function finishAnimations(page: Page): Promise<void> {
  await page.evaluate(
    "(function () {" +
      "  if (!document.getAnimations) return 0;" +
      "  var list = document.getAnimations();" +
      "  for (var i = 0; i < list.length; i++) {" +
      "    try {" +
      "      var t = list[i].effect && list[i].effect.getTiming ? list[i].effect.getTiming() : null;" +
      "      if (t && t.iterations === Infinity) continue;" +
      "      list[i].finish();" +
      "    } catch (e) {}" +
      "  }" +
      "  return list.length;" +
      "})()",
  );
}

/**
 * Waits for the things that load on **real** time, which the frozen virtual clock never
 * advances past: image decoding and web fonts.
 *
 * Without this, a capture can land while a sprite the overlay just switched to is still
 * decoding, and two identical runs differ by thousands of pixels while every computed
 * style and rect matches -- which is exactly how it presents in a report. The wait is
 * polled from Node, not with `page.waitForFunction`: that helper polls with page timers,
 * and a paused clock never fires them.
 *
 * `img.complete` also becomes true for a failed load, so a missing asset
 * (known-legacy-bugs.md #31) times the loop out rather than hanging it.
 */
export async function waitForRenderIdle(page: Page, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = (await page
      .evaluate(
        "(function () {" +
          "  var imgs = Array.prototype.slice.call(document.images);" +
          "  var pending = imgs.filter(function (i) { return !i.complete; }).length;" +
          "  var fonts = (document.fonts && document.fonts.status) || 'loaded';" +
          "  return { pending: pending, fonts: fonts };" +
          "})()",
      )
      .catch(() => ({ pending: 0, fonts: "loaded" }))) as { pending: number; fonts: string };

    if (state.pending === 0 && state.fonts === "loaded") break;
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // CSS background and mask images are not observable through `document.images`, and
  // the overlay uses them for every panel backdrop. Local file reads are sub-millisecond,
  // so one short real pause after the images are idle covers them.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await page.evaluate("0");
}
