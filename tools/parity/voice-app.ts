/**
 * Voice control in the real app (ARCHITECTURE §2 "voice"), end to end: microphone capture,
 * the voice thread, the button, and the setting changing. Run `npm run build` first.
 *
 *   npx tsx --tsconfig tsconfig.web.json tools/parity/voice-app.ts [--gen=3] [--out=<dir>]
 *
 * Replays the generation's smoke fixture through the harness (network blocked, spare ports),
 * with Chromium's fake microphone playing a fixture clip on a loop: "Hey Row-tom. ... Show base
 * stats." Then it clicks the microphone button and waits for the Stats dropdown to read Base
 * Stats. Writes voice-app.png (the settings corner) to the out folder.
 *
 * This proves the plumbing, not recognition of a real voice. It sets `voice_control` in the
 * sandbox's user state only. The fake microphone is Chromium's: the real one is never opened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "playwright-core";
import { run } from "./run.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const gen = flag("gen") ?? "3";
const root = resolve(import.meta.dirname, "../..");
const out = resolve(flag("out") ?? join(tmpdir(), "stp-voice-app"));
mkdirSync(out, { recursive: true });

const FIXTURES: Record<string, string> = {
    "1": "tools/fixtures/gen1",
    "3": "tools/fixtures/gen3/gen3-firered-smoke.fixture.jsonl.gz",
    "4": "tools/fixtures/gen4",
    "5": "tools/fixtures/gen5/gen5-black-smoke.fixture.jsonl.gz",
};
let fixture = FIXTURES[gen];
if (!fixture) throw new Error(`no fixture for gen ${gen}`);
if (!fixture.endsWith(".gz")) {
    const { readdirSync } = await import("node:fs");
    fixture = join(fixture, readdirSync(join(root, fixture)).find((f) => f.endsWith(".fixture.jsonl.gz"))!);
}

// The fake microphone loops its file: 2 s of quiet, then the clip.
const clip = readFileSync(join(root, "tools/fixtures/voice/david-seq_base.wav"));
const dataAt = clip.indexOf("data");
const pcm = clip.subarray(dataAt + 8);
const quiet = Buffer.alloc(16000 * 2 * 2);
const header = Buffer.from(clip.subarray(0, dataAt + 8));
const body = Buffer.concat([quiet, pcm]);
header.writeUInt32LE(body.length, dataAt + 4);
header.writeUInt32LE(header.length - 8 + body.length, 4);
const micFile = join(out, "fake-mic.wav");
writeFileSync(micFile, Buffer.concat([header, body]));

const consoleLines: string[] = [];
let failed = false;

async function selects(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const out: Record<string, string> = {};
        document.querySelectorAll(".stp-settings select").forEach((s, i) => {
            const label = s.closest("label, .stp-control")?.textContent?.trim().split("\n")[0] ?? `select${i}`;
            out[`${i}:${label.slice(0, 30)}`] = (s as HTMLSelectElement).value;
        });
        return out;
    });
}

await run({
    target: "unified",
    fixture: join(root, fixture),
    out: join(out, "captures"),
    redirectPorts: true,
    screenshots: false,
    extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micFile}`],
    afterReplay: async (page) => {
        page.on("console", (m) => consoleLines.push(m.text()));
        const before = await selects(page);
        const button = page.locator(".stp-voice-btn").first();
        console.log(`[voice-app] button before: ${await button.getAttribute("class")}`);
        await page.evaluate(() => (document.querySelector(".stp-voice-btn") as HTMLButtonElement).click());

        const seen = new Set<string>();
        const deadline = Date.now() + 40_000;
        let heard = false;
        while (Date.now() < deadline) {
            const cls = (await button.getAttribute("class")) ?? "";
            const status = cls.match(/stp-voice-btn-(\w+)/)?.[1] ?? "?";
            if (!seen.has(status)) {
                seen.add(status);
                console.log(`[voice-app] status: ${status}`);
            }
            if (status === "error") break;
            if (consoleLines.some((l) => l.startsWith("[voice] Heard"))) {
                heard = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        // Let Vue apply the change.
        await new Promise((r) => setTimeout(r, 500));
        const after = await selects(page);
        const changed = Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => `${k}: ${before[k]} -> ${after[k]}`);
        console.log(`[voice-app] voice lines: ${JSON.stringify(consoleLines.filter((l) => l.includes("[voice]")))}`);
        console.log(`[voice-app] tooltip: ${await button.getAttribute("title")}`);
        console.log(`[voice-app] settings changed: ${changed.length ? changed.join("; ") : "(none)"}`);
        const box = await button.boundingBox();
        if (box) {
            await page.screenshot({ path: join(out, "voice-app.png"), clip: { x: box.x - 220, y: Math.max(0, box.y - 10), width: 330, height: 45 } });
        }
        if (!heard || !changed.some((c) => /Base Stats$/.test(c))) failed = true;
        // Off again, which also checks that teardown runs cleanly.
        await page.evaluate(() => (document.querySelector(".stp-voice-btn") as HTMLButtonElement).click());
        await new Promise((r) => setTimeout(r, 500));
        console.log(`[voice-app] after turning off: ${await button.getAttribute("class")}`);
    },
    log: (m) => {
        if (/error|voice/i.test(m)) console.log(m);
    },
});

console.log(failed ? "FAIL voice-app: the command was not heard or Stats did not change to Base Stats" : `voice-app passed (gen ${gen}); picture: ${join(out, "voice-app.png")}`);
process.exit(failed ? 1 : 0);
