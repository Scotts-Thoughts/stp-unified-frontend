import { createServer, type Server } from "http";
import { readFile } from "fs";
import timerPage from "./timer-frame.html?raw";
// `oseb` is one face in gen1/gen2 and another in gen3-5 (the @font-face in gen1/gen2's style.css, gen3-5's core/styles/shared-gen345.css); the page picks by generation.
import timerFont from "../renderer/fonts/OpenSans-ExtraBold.ttf?asset";
import timerFontGen345 from "../renderer/fonts/OpenSans-ExtraBold-gen345.ttf?asset";

/**
 * Serves the overlay's clock page (`timer-frame.html`) and its font over plain HTTP on
 * 127.0.0.1, so the overlay can show the clock in an <iframe> whose address differs from
 * its own. Chromium then runs that frame in its own renderer process with its own
 * compositor surface, and nothing the overlay does can hold the clock back
 * (core/overlay/ClockFrame.ts has the renderer side).
 *
 * The page comes from the gen2 legacy app's `app/timer.html` (its 2026-09-30 "timer fix"),
 * generalised to the five generations. The font is bundled with the main process
 * (electron-vite's `?asset` import), so a packaged build has it next to this file.
 *
 * Port 30160 is single-tenant like the control server's 30159: if it is taken, the
 * overlay keeps its in-page clock. `STP_TIMER_FRAME=off` skips the server altogether,
 * which the parity harness sets so its captures keep comparing the in-page clock
 * (tools/parity/run.ts).
 */
const HOST = "127.0.0.1";
const PORT = 30160;

export class TimerFrameServer {
  readonly url = `http://${HOST}:${PORT}/timer`;
  private server: Server | null = null;

  /** Starts serving and returns the page's URL, or null when the frame is switched off. */
  start(): string | null {
    if (process.env.STP_TIMER_FRAME === "off") {
      console.log("[TimerFrame] off (STP_TIMER_FRAME=off); the overlay keeps its in-page clock");
      return null;
    }
    this.server = createServer((req, res) => {
      const pathname = (req.url ?? "/").split("?")[0];
      if (pathname === "/timer") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(timerPage);
        return;
      }
      const font = pathname === "/timer-font" ? timerFont : pathname === "/timer-font-gen345" ? timerFontGen345 : null;
      if (font) {
        readFile(font, (err, data) => {
          if (err) {
            console.error("[TimerFrame] cannot read the clock font", font, err.message);
            res.statusCode = 500;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "font/ttf");
          res.setHeader("Cache-Control", "no-cache");
          res.end(data);
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    this.server.on("error", (e: Error) => {
      console.error(`[TimerFrame] not serving the clock page (${e.message}); the overlay keeps its in-page clock`);
    });
    this.server.listen(PORT, HOST, () => {
      console.log(`[TimerFrame] clock page at ${this.url}`);
    });
    return this.url;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
