/**
 * UI-uniformity slice 5.7 (measure only): what the full-screen coloured art layers cost
 * (audit B8, decision 32) and whether gen4/gen5's doubled panel layer shows (audit C10,
 * decision 31). Nothing in the overlays is changed: every variant is a stylesheet or a
 * data attribute injected into the running page after the replay.
 *
 *   npx tsx tools/parity/art-layers-check.ts [--only=gen1,gen4] [--target=unified@<dir>]
 *        [--out=tools/reports/art-layers] [--reps=5] [--dry-run]
 *
 * For each generation's smoke fixture (gen2: the raw Crystal recording) it replays the
 * fixture into the built app through run() with --redirect-ports and the harness's
 * network block (no checkpoints are captured), then in afterReplay:
 *   1. counts the art layers (.colored-image, .tinted-box) and every element with a
 *      filter, mask-image or mix-blend-mode (on itself or its ::after), and how many show;
 *   2. C10 (gen4 ui/moveset.svg, gen5 ui/stats.svg): screenshots as is (twice, for the
 *      noise floor) and with the second copy hidden, a pixel diff, and crops of where it
 *      differs -- taken while the harness's fake clock is still paused, so nothing moves;
 *   3. an overlay-colour change (the 750 ms / 1 s background-color transition of every
 *      layer's ::after), traced over CDP: as is, with the layers' filters and ::after
 *      blend switched off, and with the layers hidden; `--reps` times each, interleaved;
 *   4. the fake clock is resumed (the overlay's clock then runs on real time) and a few
 *      seconds of idle frames are traced the same three ways.
 *
 * Writes <out>/art-layers.json, <out>/summary.md and <out>/<gen>/*.png. Run one at a
 * time, like every harness job: it launches the built app (`npm run build` first).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { PNG } from "pngjs";
import { run } from "./run.ts";
import { REPO } from "./targets.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const only = flag("only")?.split(",").filter(Boolean);
const targetSpec = flag("target") ?? "unified";
const outRoot = flag("out") ?? join(REPO, "tools", "reports", "art-layers");
const reps = Number(flag("reps") ?? 5);
const dryRun = argv.includes("--dry-run");

/** How long one colour-change window lasts: gen2's transition is 1 s, gen3-5's 750 ms. */
const CHANGE_WINDOW_MS = 1300;
/** One idle window, with the overlay's clock running. */
const IDLE_WINDOW_MS = 2000;
/** Real time to let a variant's stylesheet (and any transition it set off) settle. */
const SETTLE_MS = 1200;

const COLOURS = ["rgb(255, 64, 64)", "rgb(64, 96, 255)"];

interface Case {
  gen: string;
  fixture: string;
  /** C10: the --url of the layer drawn twice. */
  doubled?: { label: string; url: string };
}

const CASES: Case[] = [
  { gen: "gen1", fixture: join(REPO, "tools", "fixtures", "gen1", "gen1-yellow-smoke.fixture.jsonl.gz") },
  { gen: "gen2", fixture: join(REPO, "tools", "fixtures", "raw", "Pokemon Crystal - Deprecated Mapper", "c-wigglytuff-2-11311.fixture.jsonl.gz") },
  { gen: "gen3", fixture: join(REPO, "tools", "fixtures", "gen3", "gen3-firered-smoke.fixture.jsonl.gz") },
  {
    gen: "gen4",
    fixture: join(REPO, "tools", "fixtures", "gen4", "gen4-platinum-smoke.fixture.jsonl.gz"),
    doubled: { label: "ui/moveset.svg", url: "url(images/gen4/ui/moveset.svg)" },
  },
  {
    gen: "gen5",
    fixture: join(REPO, "tools", "fixtures", "gen5", "gen5-black-smoke.fixture.jsonl.gz"),
    doubled: { label: "ui/stats.svg", url: "url(images/gen5/ui/stats.svg)" },
  },
];

// ---------------------------------------------------------------------------------------
// In-page snippets

const ART = ".colored-image, .tinted-box";
const VARIANT_STYLE_ID = "art-layers-check-variant";
type Variant = "asis" | "noblend" | "hidden";
const VARIANTS: Variant[] = ["asis", "noblend", "hidden"];
const VARIANT_CSS: Record<Variant, string> = {
  asis: "",
  // The layer's own filter (saturate + drop-shadow, inline or .ds) and the ::after's
  // saturate filter and colour blend. The mask and the transition stay.
  noblend:
    ".colored-image, .tinted-box { filter: none !important; }\n" +
    ".colored-image::after, .tinted-box::after { filter: none !important; mix-blend-mode: normal !important; }",
  hidden: ".colored-image, .tinted-box { display: none !important; }",
};

function setVariantJs(css: string): string {
  return `(() => {
    let s = document.getElementById(${JSON.stringify(VARIANT_STYLE_ID)});
    if (!s) { s = document.createElement("style"); s.id = ${JSON.stringify(VARIANT_STYLE_ID)}; document.head.appendChild(s); }
    s.textContent = ${JSON.stringify(css)};
    return true;
  })()`;
}

/** Layer and effect counts; `full` = covers at least 1900x1000. */
const COUNT_JS = `(() => {
  const ART = ${JSON.stringify(ART)};
  const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const out = {
    art: { total: 0, visible: 0, full: 0, fullVisible: 0, withFilter: 0, withFilterVisible: 0, withAfterBlend: 0, withAfterBlendVisible: 0 },
    effects: { filter: [0, 0], mask: [0, 0], blend: [0, 0], afterFilter: [0, 0], afterMask: [0, 0], afterBlend: [0, 0] },
    fullScreenEffect: { total: 0, visible: 0, nonArt: [] },
    layers: [],
  };
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const af = getComputedStyle(el, "::after");
    const hasAfter = af.content !== "none" && af.content !== "normal";
    const f = cs.filter !== "none";
    const m = (cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none");
    const b = cs.mixBlendMode !== "normal";
    const af_ = hasAfter && af.filter !== "none";
    const am = hasAfter && ((af.maskImage && af.maskImage !== "none") || (af.webkitMaskImage && af.webkitMaskImage !== "none"));
    const ab = hasAfter && af.mixBlendMode !== "normal";
    if (!(f || m || b || af_ || am || ab) && !el.matches(ART)) continue;
    const r = el.getBoundingClientRect();
    const v = vis(el) && r.width > 0 && r.height > 0;
    const full = r.width >= 1900 && r.height >= 1000;
    const k = v ? 1 : 0;
    if (f) { out.effects.filter[0]++; out.effects.filter[1] += k; }
    if (m) { out.effects.mask[0]++; out.effects.mask[1] += k; }
    if (b) { out.effects.blend[0]++; out.effects.blend[1] += k; }
    if (af_) { out.effects.afterFilter[0]++; out.effects.afterFilter[1] += k; }
    if (am) { out.effects.afterMask[0]++; out.effects.afterMask[1] += k; }
    if (ab) { out.effects.afterBlend[0]++; out.effects.afterBlend[1] += k; }
    const isArt = el.matches(ART);
    if (full && (f || m || b || af_ || am || ab)) {
      out.fullScreenEffect.total++; out.fullScreenEffect.visible += k;
      if (!isArt) out.fullScreenEffect.nonArt.push({ tag: el.tagName.toLowerCase(), cls: String(el.className), filter: cs.filter, visible: v });
    }
    if (!isArt) continue;
    out.art.total++; out.art.visible += k;
    if (full) { out.art.full++; out.art.fullVisible += k; }
    if (f) { out.art.withFilter++; out.art.withFilterVisible += k; }
    if (ab) { out.art.withAfterBlend++; out.art.withAfterBlendVisible += k; }
    const url = cs.getPropertyValue("--url").trim() || el.getAttribute("src") || "";
    out.layers.push({ cls: String(el.className), url, visible: v, width: Math.round(r.width), height: Math.round(r.height), filter: cs.filter, afterBlend: hasAfter ? af.mixBlendMode : null, afterTransition: hasAfter ? af.transition : null });
  }
  return out;
})()`;

/** Sets the overlay colour the way the overlays' watchers do (on <html>), plus every inline copy (gen3-5's enemy area). */
function setColourJs(colour: string, mark: string): string {
  return `(() => {
    const els = new Set([document.documentElement, ...document.querySelectorAll('[style*="--overlay-color"]')]);
    console.timeStamp(${JSON.stringify(mark)});
    for (const el of els) el.style.setProperty("--overlay-color", ${JSON.stringify(colour)});
    return els.size;
  })()`;
}

const READ_COLOUR_JS = `(() => {
  const els = [document.documentElement, ...document.querySelectorAll('[style*="--overlay-color"]')];
  return [...new Set(els)].map((el) => [el === document.documentElement ? "html" : el.className, el.style.getPropertyValue("--overlay-color")]);
})()`;

function restoreColourJs(saved: [string, string][]): string {
  return `(() => {
    const saved = ${JSON.stringify(saved)};
    const els = [...new Set([document.documentElement, ...document.querySelectorAll('[style*="--overlay-color"]')])];
    els.forEach((el, i) => {
      const v = saved[i] ? saved[i][1] : "";
      if (v) el.style.setProperty("--overlay-color", v); else el.style.removeProperty("--overlay-color");
    });
    return els.length;
  })()`;
}

/** The ::after colour of the first visible art layer (proves the change reached the layers). */
const AFTER_COLOUR_JS = `(() => {
  for (const el of document.querySelectorAll(${JSON.stringify(ART)})) {
    if (!el.checkVisibility()) continue;
    const af = getComputedStyle(el, "::after");
    if (af.content === "none" || af.content === "normal") continue;
    return af.backgroundColor;
  }
  return null;
})()`;

const CLOCK_TEXT_JS = `(() => [...document.querySelectorAll(".gametimeClock")].map((e) => e.textContent).join("|"))()`;

/** C10: "none" = as is; "hide" = second copy hidden; "opaque" = second hidden and the first at opacity .99 (what two .9 layers add up to where the art is solid). */
function markDoubledJs(url: string, mode: "none" | "hide" | "opaque"): string {
  return `(() => {
    const els = [...document.querySelectorAll(".colored-image")].filter((e) => (e.getAttribute("style") || "").includes(${JSON.stringify(url)}));
    let s = document.getElementById("art-layers-check-c10");
    if (!s) { s = document.createElement("style"); s.id = "art-layers-check-c10"; s.textContent = '[data-art-c10="hide"] { display: none !important; } [data-art-c10="opaque"] { opacity: 0.99 !important; }'; document.head.appendChild(s); }
    els.forEach((e) => e.removeAttribute("data-art-c10"));
    const mode = ${JSON.stringify(mode)};
    if (mode !== "none" && els.length > 1) els[1].setAttribute("data-art-c10", "hide");
    if (mode === "opaque" && els.length > 1) els[0].setAttribute("data-art-c10", "opaque");
    return els.map((e) => ({ style: e.getAttribute("style"), visible: e.checkVisibility() }));
  })()`;
}

// ---------------------------------------------------------------------------------------
// Tracing

const TRACE_CATEGORIES = [
  "toplevel",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink",
  "cc",
  "gpu",
  "viz",
];

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: any;
}

async function traceWindow(cdp: CDPSession, windowMs: number, act: () => Promise<void>): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  const onData = (e: { value: object[] }) => { for (const ev of e.value) events.push(ev as TraceEvent); };
  cdp.on("Tracing.dataCollected", onData);
  try {
    await cdp.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: TRACE_CATEGORIES },
    } as any);
    await sleep(150);
    await act();
    await sleep(windowMs + 100);
    const done = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
    await cdp.send("Tracing.end");
    await done;
  } finally {
    cdp.off("Tracing.dataCollected", onData);
  }
  return events;
}

interface WindowStats {
  /** The TimeStamp mark was found (the window is anchored on it). */
  anchored: boolean;
  frames: number;
  /** Thread busy time (union of toplevel tasks), ms, keyed "<process>/<thread>". */
  busy: Record<string, number>;
  /** Renderer main-thread phases, ms. */
  phases: { style: number; layout: number; prePaint: number; paint: number; layerize: number; rendering: number };
  /** Renderer raster (RasterTask on the tile workers), ms. */
  raster: number;
  /** GPU process busy (CrGpuMain + VizCompositorThread), ms. */
  gpu: number;
  rendererMain: number;
  /** Top event names by time on the GPU process threads (diagnostics). */
  gpuTop: [string, number][];
  rendererTop: [string, number][];
}

function analyse(events: TraceEvent[], mark: string, windowMs: number): WindowStats {
  const threadName = new Map<string, string>();
  const processName = new Map<number, string>();
  for (const e of events) {
    if (e.ph !== "M") continue;
    if (e.name === "thread_name") threadName.set(`${e.pid}:${e.tid}`, String(e.args?.name ?? ""));
    if (e.name === "process_name") processName.set(e.pid, String(e.args?.name ?? ""));
  }
  const markEv = events.find((e) => e.name === "TimeStamp" && (e.args?.data?.message === mark || e.args?.data?.name === mark));
  const rendererPid = markEv?.pid ?? [...threadName.entries()].find(([, n]) => n === "CrRendererMain")?.[0].split(":").map(Number)[0];
  const tsAll = events.filter((e) => e.ph !== "M" && e.ts > 0).map((e) => e.ts);
  const t0 = markEv?.ts ?? (tsAll.length ? Math.min(...tsAll) + 150_000 : 0);
  const t1 = t0 + windowMs * 1000;

  // B/E pairs -> complete slices.
  const slices: { name: string; cat: string; pid: number; tid: number; s: number; e: number }[] = [];
  const stacks = new Map<string, TraceEvent[]>();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (e.ph === "X" && typeof e.dur === "number") slices.push({ name: e.name, cat: e.cat, pid: e.pid, tid: e.tid, s: e.ts, e: e.ts + e.dur });
    else if (e.ph === "B") {
      const k = `${e.pid}:${e.tid}`;
      if (!stacks.has(k)) stacks.set(k, []);
      stacks.get(k)!.push(e);
    } else if (e.ph === "E") {
      const b = stacks.get(`${e.pid}:${e.tid}`)?.pop();
      if (b) slices.push({ name: b.name, cat: b.cat, pid: b.pid, tid: b.tid, s: b.ts, e: e.ts });
    }
  }

  const role = (pid: number) => {
    if (pid === rendererPid) return "renderer";
    const p = processName.get(pid) ?? "";
    if (/gpu/i.test(p)) return "gpu";
    if (/browser/i.test(p)) return "browser";
    return p ? p.toLowerCase().replace(/\s+/g, "-") : `pid${pid}`;
  };
  const tname = (pid: number, tid: number) => (threadName.get(`${pid}:${tid}`) ?? `tid${tid}`).replace(/\d+$/, "");

  /** Union length of intervals clipped to the window, ms. */
  const union = (iv: [number, number][]) => {
    const c = iv.map(([s, e]) => [Math.max(s, t0), Math.min(e, t1)] as [number, number]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cs = -1;
    let ce = -1;
    for (const [s, e] of c) {
      if (s > ce) { if (ce > cs) total += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e);
    }
    if (ce > cs) total += ce - cs;
    return total / 1000;
  };
  const group = <K>(items: typeof slices, key: (x: (typeof slices)[number]) => K | null) => {
    const m = new Map<K, [number, number][]>();
    for (const x of items) {
      const k = key(x);
      if (k === null) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push([x.s, x.e]);
    }
    return m;
  };

  // Thread busy: toplevel tasks, union per thread (tile workers etc. are summed per thread first, then per name).
  const busy: Record<string, number> = {};
  for (const [k, iv] of group(slices.filter((x) => x.cat.split(",").includes("toplevel")), (x) => `${x.pid}:${x.tid}`)) {
    const [pid, tid] = k.split(":").map(Number);
    const key = `${role(pid)}/${tname(pid, tid)}`;
    busy[key] = round((busy[key] ?? 0) + union(iv));
  }

  const onRendererMain = slices.filter((x) => x.pid === rendererPid && tname(x.pid, x.tid) === "CrRendererMain");
  const byName = (items: typeof slices) => {
    const m: Record<string, number> = {};
    for (const [name, iv] of group(items, (x) => x.name)) m[name] = union(iv);
    return m;
  };
  const rm = byName(onRendererMain);
  const phases = {
    style: round((rm.UpdateLayoutTree ?? 0) + (rm.RecalculateStyles ?? 0)),
    layout: round(rm.Layout ?? 0),
    prePaint: round(rm.PrePaint ?? 0),
    paint: round(rm.Paint ?? 0),
    layerize: round((rm.Layerize ?? 0) + (rm.CompositeLayers ?? 0) + (rm.UpdateLayer ?? 0)),
    rendering: 0,
  };
  phases.rendering = round(phases.style + phases.layout + phases.prePaint + phases.paint + phases.layerize);

  const raster = round(
    union(slices.filter((x) => x.pid === rendererPid && x.name === "RasterTask").map((x) => [x.s, x.e] as [number, number])),
  );
  const gpuSlices = slices.filter((x) => role(x.pid) === "gpu" && /^(CrGpuMain|VizCompositorThread)$/.test(tname(x.pid, x.tid)));
  const gpuTop = Object.entries(byName(gpuSlices.filter((x) => !x.cat.split(",").includes("toplevel"))))
    .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, v]) => [n, round(v)] as [string, number]);
  const rendererTop = Object.entries(rm).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, v]) => [n, round(v)] as [string, number]);

  const inWin = (e: TraceEvent) => e.ts >= t0 && e.ts <= t1;
  let frames = events.filter((e) => e.name === "Display::DrawAndSwap" && (e.ph === "X" || e.ph === "B") && inWin(e)).length;
  if (!frames) frames = events.filter((e) => e.name === "DrawFrame" && inWin(e)).length;

  const gpu = round(Object.entries(busy).filter(([k]) => /^gpu\/(CrGpuMain|VizCompositorThread)$/.test(k)).reduce((a, [, v]) => a + v, 0));
  return {
    anchored: !!markEv,
    frames,
    busy,
    phases,
    raster,
    gpu,
    rendererMain: busy["renderer/CrRendererMain"] ?? 0,
    gpuTop,
    rendererTop,
  };
}

// ---------------------------------------------------------------------------------------
// Pixels

function readPng(file: string): PNG {
  return PNG.sync.read(readFileSync(file));
}

interface PixelDiff {
  width: number;
  height: number;
  changed: number;
  maxDelta: number;
  meanDelta: number;
  /** Pixels whose largest channel difference is above 8 / 32 levels (out of 255). */
  over8: number;
  over32: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  peak: { x: number; y: number } | null;
}

function diffPngs(a: PNG, b: PNG): PixelDiff & { delta: Uint8Array } {
  const { width, height } = a;
  const delta = new Uint8Array(width * height);
  let changed = 0, max = 0, sum = 0, over8 = 0, over32 = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1, px = -1, py = -1;
  if (b.width !== width || b.height !== height) throw new Error(`size mismatch ${width}x${height} vs ${b.width}x${b.height}`);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]));
      if (!d) continue;
      delta[y * width + x] = d;
      changed++;
      sum += d;
      if (d > 8) over8++;
      if (d > 32) over32++;
      if (d > max) { max = d; px = x; py = y; }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return {
    width, height, changed, maxDelta: max, meanDelta: changed ? round(sum / changed) : 0, over8, over32,
    bbox: changed ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
    peak: changed ? { x: px, y: py } : null,
    delta,
  };
}

function crop(src: PNG, x: number, y: number, w: number, h: number, scale = 1): PNG {
  const out = new PNG({ width: w * scale, height: h * scale });
  for (let yy = 0; yy < h * scale; yy++) {
    for (let xx = 0; xx < w * scale; xx++) {
      const sx = x + Math.floor(xx / scale), sy = y + Math.floor(yy / scale);
      const si = (sy * src.width + sx) * 4, di = (yy * w * scale + xx) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = 255;
    }
  }
  return out;
}

function stacked(top: PNG, bottom: PNG, gap = 8): PNG {
  const out = new PNG({ width: Math.max(top.width, bottom.width), height: top.height + gap + bottom.height });
  out.data.fill(255);
  PNG.bitblt(top, out, 0, 0, top.width, top.height, 0, 0);
  PNG.bitblt(bottom, out, 0, 0, bottom.width, bottom.height, 0, top.height + gap);
  return out;
}

function sideBySide(left: PNG, right: PNG, gap = 8): PNG {
  const out = new PNG({ width: left.width + gap + right.width, height: Math.max(left.height, right.height) });
  out.data.fill(255);
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + gap, 0);
  return out;
}

/** The difference made visible: black where equal, white-ish in proportion to the delta (x8). */
function deltaImage(delta: Uint8Array, width: number, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const d = Math.min(255, delta[(y + yy) * width + x + xx] * 8);
      const i = (yy * w + xx) * 4;
      out.data[i] = d; out.data[i + 1] = d ? Math.max(40, d) : 0; out.data[i + 2] = d; out.data[i + 3] = 255;
    }
  }
  return out;
}

function writePng(file: string, png: PNG): void {
  writeFileSync(file, PNG.sync.write(png));
}

// ---------------------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

type Metrics = Record<string, number>;

async function perfMetrics(cdp: CDPSession): Promise<Metrics> {
  const r = (await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  const m: Metrics = {};
  for (const x of r.metrics) m[x.name] = x.value;
  return m;
}

function metricDelta(a: Metrics, b: Metrics): Record<string, number> {
  const pick = ["TaskDuration", "RecalcStyleDuration", "LayoutDuration", "ScriptDuration"];
  const out: Record<string, number> = {};
  for (const k of pick) out[k] = round(((b[k] ?? 0) - (a[k] ?? 0)) * 1000);
  return out;
}

interface Sample {
  rep: number;
  variant: Variant;
  stats?: WindowStats;
  metrics: Record<string, number>;
  error?: string;
  /** colour change only: the first layer's ::after colour at the end of the window. */
  afterColour?: string | null;
  target?: string;
}

function summarise(samples: Sample[]) {
  const out: Record<string, any> = {};
  for (const v of VARIANTS) {
    const s = samples.filter((x) => x.variant === v && x.stats);
    const pick = (f: (w: WindowStats) => number) => median(s.map((x) => f(x.stats!)));
    out[v] = {
      n: s.length,
      frames: pick((w) => w.frames),
      rendering: pick((w) => w.phases.rendering),
      style: pick((w) => w.phases.style),
      layout: pick((w) => w.phases.layout),
      prePaint: pick((w) => w.phases.prePaint),
      paint: pick((w) => w.phases.paint),
      layerize: pick((w) => w.phases.layerize),
      raster: pick((w) => w.raster),
      rendererMain: pick((w) => w.rendererMain),
      gpu: pick((w) => w.gpu),
      gpuPerFrame: pick((w) => (w.frames ? w.gpu / w.frames : NaN)),
      mainPerFrame: pick((w) => (w.frames ? w.rendererMain / w.frames : NaN)),
      cdpTaskMs: median(samples.filter((x) => x.variant === v).map((x) => x.metrics.TaskDuration)),
      cdpStyleMs: median(samples.filter((x) => x.variant === v).map((x) => x.metrics.RecalcStyleDuration)),
      anchored: s.every((x) => x.stats!.anchored),
      errors: samples.filter((x) => x.variant === v && x.error).map((x) => x.error),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------

const cases = CASES.filter((c) => !only || only.includes(c.gen));
const missing = cases.filter((c) => !existsSync(c.fixture));
const appOut = targetSpec === "unified" ? join(REPO, "out") : join(targetSpec.replace(/^unified@/, ""), "out");

const builtMarker = join(appOut, "renderer", "index.html");
console.log(`[art-layers] target ${targetSpec} (${appOut}${existsSync(builtMarker) ? `, built ${statSync(builtMarker).mtime.toISOString()}` : ", NOT BUILT"})`);
console.log(`[art-layers] ${cases.length} case(s), ${reps} rep(s) each, out ${outRoot}`);
for (const c of cases) console.log(`  ${c.gen}: ${relative(REPO, c.fixture)}${existsSync(c.fixture) ? "" : "  (MISSING)"}${c.doubled ? `; C10 ${c.doubled.label}` : ""}`);
if (dryRun) {
  // No app: check that the page snippets parse and that the trace and pixel maths add up.
  for (const js of [COUNT_JS, setColourJs("red", "m"), READ_COLOUR_JS, restoreColourJs([["html", "red"]]), AFTER_COLOUR_JS, CLOCK_TEXT_JS, markDoubledJs("url(x)", "opaque"), setVariantJs(VARIANT_CSS.noblend)]) new Function(`return ${js}`);
  const M = (name: string, tid: number, args: object): TraceEvent => ({ name, cat: "__metadata", ph: "M", ts: 0, pid: 1, tid, args });
  const X = (name: string, cat: string, tid: number, ts: number, dur: number, pid = 1): TraceEvent => ({ name, cat, ph: "X", ts, dur, pid, tid });
  const t = analyse([
    M("thread_name", 10, { name: "CrRendererMain" }), { ...M("process_name", 0, { name: "GPU Process" }), pid: 2 }, { ...M("thread_name", 20, { name: "CrGpuMain" }), pid: 2 },
    { name: "TimeStamp", cat: "devtools.timeline", ph: "I", ts: 1_000_000, pid: 1, tid: 10, args: { data: { message: "m" } } },
    X("ThreadControllerImpl::RunTask", "toplevel", 10, 999_000, 3_000), X("ThreadControllerImpl::RunTask", "toplevel", 10, 1_001_000, 1_000),
    X("Paint", "devtools.timeline", 10, 1_000_500, 1_000), X("UpdateLayoutTree", "devtools.timeline", 10, 1_001_500, 500),
    X("ThreadControllerImpl::RunTask", "toplevel", 20, 1_010_000, 4_000, 2), X("Display::DrawAndSwap", "viz", 20, 1_010_000, 2_000, 2),
    X("ThreadControllerImpl::RunTask", "toplevel", 20, 1_200_000, 4_000, 2),
  ], "m", 100);
  const ok = t.anchored && t.rendererMain === 2 && t.phases.paint === 1 && t.phases.style === 0.5 && t.gpu === 4 && t.frames === 1;
  const a = new PNG({ width: 4, height: 2 }), b = new PNG({ width: 4, height: 2 });
  a.data.fill(0); b.data.fill(0); b.data[(1 * 4 + 2) * 4] = 40;
  const d = diffPngs(a, b);
  const ok2 = d.changed === 1 && d.maxDelta === 40 && d.over32 === 1 && d.bbox?.x === 2 && d.bbox?.y === 1;
  console.log(`[art-layers] --dry-run: snippets parse; trace maths ${ok ? "ok" : "WRONG " + JSON.stringify(t)}; pixel maths ${ok2 ? "ok" : "WRONG " + JSON.stringify({ ...d, delta: undefined })}; nothing launched`);
  if (!ok || !ok2) process.exit(1);
  process.exit(missing.length ? 1 : 0);
}
if (!/^unified(@.+)?$/.test(targetSpec)) throw new Error(`target must be unified or unified@<dir>, not ${targetSpec}`);
if (missing.length) throw new Error(`missing fixture(s): ${missing.map((c) => c.fixture).join(", ")}`);
mkdirSync(outRoot, { recursive: true });

const report: Record<string, any> = {
  ranAt: new Date().toISOString(),
  target: targetSpec,
  appOut,
  reps,
  changeWindowMs: CHANGE_WINDOW_MS,
  idleWindowMs: IDLE_WINDOW_MS,
  variants: VARIANT_CSS,
  gens: {} as Record<string, any>,
};
const reportFile = join(outRoot, "art-layers.json");
if (existsSync(reportFile) && only) {
  // A partial rerun (--only) keeps the other generations' results.
  try { Object.assign(report.gens, JSON.parse(readFileSync(reportFile, "utf8")).gens ?? {}); } catch { /* fresh */ }
}

for (const c of cases) {
  const genDir = join(outRoot, c.gen);
  mkdirSync(genDir, { recursive: true });
  const g: Record<string, any> = { fixture: relative(REPO, c.fixture) };
  report.gens[c.gen] = g;
  console.log(`\n[art-layers] ${c.gen}: replaying ${relative(REPO, c.fixture)}`);
  const result = await run({
    target: targetSpec,
    fixture: c.fixture,
    out: join(genDir, "run"),
    // No checkpoint matches: the fixture is replayed in full and nothing is captured.
    only: ["__art_layers_no_checkpoint__"],
    screenshots: false,
    redirectPorts: true,
    log: (m) => { if (/^\[run\] (unified|profile|BLOCKED|window|--)/.test(m)) console.log(m); },
    afterReplay: async (page: Page) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.bringToFront().catch(() => {});
      await sleep(SETTLE_MS);
      g.viewport = await page.evaluate("[innerWidth, innerHeight, devicePixelRatio]");

      // 1. Counts.
      g.counts = await page.evaluate(COUNT_JS);
      const counts = g.counts as any;
      console.log(`[art-layers]   art layers ${counts.art.total} (${counts.art.visible} visible), full-screen ${counts.art.full}, with a filter ${counts.art.withFilter} (${counts.art.withFilterVisible} visible), ::after blend ${counts.art.withAfterBlend}`);

      // 2. C10 screenshots, clock still paused.
      if (c.doubled) {
        const a1 = join(genDir, "c10-as-is.png");
        const a2 = join(genDir, "c10-as-is-repeat.png");
        const b = join(genDir, "c10-second-copy-hidden.png");
        const o = join(genDir, "c10-second-hidden-first-opacity-099.png");
        const before = await page.evaluate(markDoubledJs(c.doubled.url, "none"));
        await page.screenshot({ path: a1 });
        await sleep(400);
        await page.screenshot({ path: a2 });
        const hidden = await page.evaluate(markDoubledJs(c.doubled.url, "hide"));
        await sleep(600);
        await page.screenshot({ path: b });
        await page.evaluate(markDoubledJs(c.doubled.url, "opaque"));
        await sleep(600);
        await page.screenshot({ path: o });
        await page.evaluate(markDoubledJs(c.doubled.url, "none"));
        const A1 = readPng(a1), A2 = readPng(a2), B = readPng(b), O = readPng(o);
        const noise = diffPngs(A1, A2);
        const eff = diffPngs(A1, B);
        const effOpaque = diffPngs(A1, O);
        const files: Record<string, string> = { asIs: a1, asIsRepeat: a2, hidden: b, hiddenFirstOpacity099: o };
        if (eff.bbox) {
          const pad = 16;
          const x = Math.max(0, eff.bbox.x - pad), y = Math.max(0, eff.bbox.y - pad);
          const w = Math.min(A1.width - x, eff.bbox.w + 2 * pad), h = Math.min(A1.height - y, eff.bbox.h + 2 * pad);
          files.cropAsIs = join(genDir, "c10-crop-as-is.png");
          files.cropHidden = join(genDir, "c10-crop-second-copy-hidden.png");
          files.cropDelta = join(genDir, "c10-crop-difference-x8.png");
          writePng(files.cropAsIs, crop(A1, x, y, w, h));
          writePng(files.cropHidden, crop(B, x, y, w, h));
          writePng(files.cropDelta, deltaImage(eff.delta, A1.width, x, y, w, h));
          files.stacked = join(genDir, "c10-panel-as-is-top-hidden-bottom.png");
          writePng(files.stacked, stacked(crop(A1, x, y, w, h), crop(B, x, y, w, h)));
          files.cropOpaqueDelta = join(genDir, "c10-crop-difference-x8-opacity-099.png");
          writePng(files.cropOpaqueDelta, deltaImage(effOpaque.delta, A1.width, x, y, w, h));
          // A 4x close-up around the largest difference, as is | hidden.
          const zw = 200, zh = 120;
          const zx = Math.min(Math.max(0, eff.peak!.x - zw / 2), A1.width - zw), zy = Math.min(Math.max(0, eff.peak!.y - zh / 2), A1.height - zh);
          files.zoom = join(genDir, "c10-zoom-4x-as-is-left-hidden-right.png");
          writePng(files.zoom, sideBySide(crop(A1, zx, zy, zw, zh, 4), crop(B, zx, zy, zw, zh, 4)));
          g.c10Crop = { x, y, w, h, zoom: { x: zx, y: zy, w: zw, h: zh } };
        }
        const strip = ({ delta, ...rest }: ReturnType<typeof diffPngs>) => { void delta; return rest; };
        g.c10 = { layer: c.doubled.label, copiesBefore: before, copiesAfterHide: hidden, noise: strip(noise), effect: strip(eff), effectWithOpacity099: strip(effOpaque), files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, relative(REPO, v)])) };
        console.log(`[art-layers]   C10 ${c.doubled.label}: ${(before as any[]).length} copies; hiding the second changes ${eff.changed} px (max ${eff.maxDelta}/255, >8: ${eff.over8}, >32: ${eff.over32}); noise floor ${noise.changed} px; with the first at opacity .99 instead: ${effOpaque.changed} px (max ${effOpaque.maxDelta}, >8: ${effOpaque.over8})`);
      }

      // 3. Colour changes (clock paused: the transition is the only thing moving).
      const savedColours = (await page.evaluate(READ_COLOUR_JS)) as [string, string][];
      g.savedColours = savedColours;
      const change: Sample[] = [];
      let colourIndex = 0;
      for (let rep = 0; rep < reps; rep++) {
        for (const v of VARIANTS) {
          await page.evaluate(setVariantJs(VARIANT_CSS[v]));
          await sleep(SETTLE_MS);
          const colour = COLOURS[colourIndex++ % COLOURS.length];
          const mark = `art-change-${c.gen}-${rep}-${v}`;
          const s: Sample = { rep, variant: v, metrics: {}, target: colour };
          try {
            let m0: Metrics = {};
            const events = await traceWindow(cdp, CHANGE_WINDOW_MS, async () => {
              m0 = await perfMetrics(cdp);
              await page.evaluate(setColourJs(colour, mark));
            });
            s.metrics = metricDelta(m0, await perfMetrics(cdp));
            s.stats = analyse(events, mark, CHANGE_WINDOW_MS);
          } catch (err) {
            s.error = String(err);
          }
          if (v !== "hidden") s.afterColour = (await page.evaluate(AFTER_COLOUR_JS)) as string | null;
          change.push(s);
        }
        console.log(`[art-layers]   colour change rep ${rep + 1}/${reps}: ` + VARIANTS.map((v) => {
          const s = change.find((x) => x.rep === rep && x.variant === v)!;
          return s.stats ? `${v} ${s.stats.frames}f main ${s.stats.rendererMain}ms gpu ${s.stats.gpu}ms` : `${v} ERROR ${s.error}`;
        }).join(" | "));
      }
      await page.evaluate(setVariantJs(""));
      await page.evaluate(restoreColourJs(savedColours));
      g.colourChange = { samples: change, median: summarise(change) };

      // 4. Idle with the overlay's clock running on real time.
      await page.clock.resume();
      await sleep(SETTLE_MS);
      const c0 = await page.evaluate(CLOCK_TEXT_JS);
      await sleep(1000);
      const c1 = await page.evaluate(CLOCK_TEXT_JS);
      g.clock = { before: c0, after: c1, running: c0 !== c1 };
      console.log(`[art-layers]   clock ${g.clock.running ? "running" : "NOT running"} (${c0} -> ${c1})`);
      const idle: Sample[] = [];
      for (let rep = 0; rep < reps; rep++) {
        for (const v of VARIANTS) {
          await page.evaluate(setVariantJs(VARIANT_CSS[v]));
          await sleep(SETTLE_MS);
          const mark = `art-idle-${c.gen}-${rep}-${v}`;
          const s: Sample = { rep, variant: v, metrics: {} };
          try {
            let m0: Metrics = {};
            const events = await traceWindow(cdp, IDLE_WINDOW_MS, async () => {
              m0 = await perfMetrics(cdp);
              await page.evaluate(`console.timeStamp(${JSON.stringify(mark)})`);
            });
            s.metrics = metricDelta(m0, await perfMetrics(cdp));
            s.stats = analyse(events, mark, IDLE_WINDOW_MS);
          } catch (err) {
            s.error = String(err);
          }
          idle.push(s);
        }
        console.log(`[art-layers]   idle rep ${rep + 1}/${reps}: ` + VARIANTS.map((v) => {
          const s = idle.find((x) => x.rep === rep && x.variant === v)!;
          return s.stats ? `${v} ${s.stats.frames}f main ${s.stats.rendererMain}ms gpu ${s.stats.gpu}ms` : `${v} ERROR ${s.error}`;
        }).join(" | "));
      }
      await page.evaluate(setVariantJs(""));
      g.idle = { samples: idle, median: summarise(idle) };
      await cdp.detach().catch(() => {});
    },
  });
  g.consoleErrors = result.consoleErrors;
  writeFileSync(reportFile, JSON.stringify(report, null, 1));
}

// ---------------------------------------------------------------------------------------
// Markdown summary

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");
const lines: string[] = [
  "# Art layers (slice 5.7): measurements",
  "",
  `Target \`${report.target}\`, ${report.ranAt}. Medians of ${reps} runs. Colour change: a ${CHANGE_WINDOW_MS} ms window from the`,
  `change, clock paused. Idle: ${IDLE_WINDOW_MS} ms with the overlay's clock running. Times are CPU milliseconds in the window`,
  "(renderer main thread: style + layout + pre-paint + paint + layerize; raster: the renderer's tile workers; GPU: the",
  "GPU process's main and compositor threads). Variants: **as is**; **no blend** (layers' filters and `::after` blend",
  "switched off); **hidden** (layers not drawn).",
  "",
];
for (const [gen, g] of Object.entries(report.gens) as [string, any][]) {
  lines.push(`## ${gen}`, "");
  if (g.counts) {
    const a = g.counts.art;
    lines.push(`Art layers: ${a.total} (${a.visible} visible), ${a.full} full-screen; ${a.withFilter} with a filter (${a.withFilterVisible} visible), ${a.withAfterBlend} with a blended \`::after\` (${a.withAfterBlendVisible} visible). Other full-screen elements with an effect: ${g.counts.fullScreenEffect.nonArt.length}.`, "");
  }
  for (const [label, block] of [["Colour change", g.colourChange], ["Idle (clock running)", g.idle]] as [string, any][]) {
    if (!block) continue;
    lines.push(`**${label}**`, "", "| variant | frames | main rendering ms | paint ms | raster ms | main busy ms | GPU busy ms | GPU ms/frame |", "|---|---|---|---|---|---|---|---|");
    for (const v of VARIANTS) {
      const m = block.median[v];
      lines.push(`| ${v} | ${fmt(m.frames)} | ${fmt(m.rendering)} | ${fmt(m.paint)} | ${fmt(m.raster)} | ${fmt(m.rendererMain)} | ${fmt(m.gpu)} | ${fmt(m.gpuPerFrame)} |`);
    }
    const errs = VARIANTS.flatMap((v) => block.median[v].errors);
    if (errs.length) lines.push("", `Errors: ${errs.join("; ")}`);
    lines.push("");
  }
  if (g.clock) lines.push(`Clock: ${g.clock.running ? "running" : "**not running**"} (${g.clock.before} -> ${g.clock.after}).`, "");
  if (g.c10) {
    const e = g.c10.effect, n = g.c10.noise;
    lines.push(
      `**C10 (${g.c10.layer} drawn twice):** hiding the second copy changes ${e.changed} pixels (largest change ${e.maxDelta}/255, mean ${e.meanDelta}; ${e.over8} above 8, ${e.over32} above 32). Two shots as is differ by ${n.changed} pixels. With the second hidden and the first at opacity .99 instead: ${g.c10.effectWithOpacity099?.changed} pixels differ (largest ${g.c10.effectWithOpacity099?.maxDelta}, ${g.c10.effectWithOpacity099?.over8} above 8).`,
      "",
      ...Object.entries(g.c10.files as Record<string, string>).map(([k, f]) => `- ${k}: \`${f}\``),
      "",
    );
  }
}
writeFileSync(join(outRoot, "summary.md"), lines.join("\n"));
writeFileSync(reportFile, JSON.stringify(report, null, 1));
console.log(`\n[art-layers] wrote ${reportFile} and ${join(outRoot, "summary.md")}`);
