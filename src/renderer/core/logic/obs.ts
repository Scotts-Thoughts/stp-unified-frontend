import { getUserState } from "~/core/persistence/userState";

/**
 * Send an OBS WebSocket 5 "CreateRecordChapter" request (Add Chapter Marker).
 * Connects to ws://localhost:4455 (or the saved `obs_websocket_url`), identifies, sends the
 * chapter name, then closes. Fails silently if OBS is not running.
 * Optional: set `obs_websocket_password` in the user state if OBS has authentication enabled.
 * Both keep the key names they had in localStorage (plan 1.10, core/persistence/userState.ts).
 *
 * The sha256 pair for the authentication challenge is computed in the main process
 * (`obs:auth`) instead of `require("crypto")` here (plan 1.6). That makes Identify
 * asynchronous, so the socket may be gone by the time the digest comes back -- hence the
 * readyState check before sending.
 *
 * gen3's method (plan 2.4) sends a `GetRecordStatus` probe after Identify and the
 * chapter request only once its reply arrives, logging the recording state and any
 * failure code; `probeStatus` reproduces that exchange, logs included, so an OBS
 * trace of the unified app matches the legacy one request for request.
 *
 * @param chapterName Name for the chapter marker (e.g. "RESET", "IN - BROCK")
 */
export function sendObsChapterMarker(chapterName: string, options: { probeStatus?: boolean } = {}): void {
	const url = getUserState<string | null>("obs_websocket_url", null) || "ws://localhost:4455";
	const password = getUserState<string | null>("obs_websocket_password", null) || null;
	const requestId = "chapter-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
	if (options.probeStatus) console.log(`[OBS chapter marker] sendObsChapterMarker("${chapterName}") called, connecting to ${url}`);
	let ws: WebSocket;
	try {
		ws = new WebSocket(url);
	} catch (e) {
		if (options.probeStatus) console.error(`[OBS chapter marker] Failed to open WebSocket to ${url}:`, e);
		return;
	}
	ws.onerror = (event) => {
		if (options.probeStatus) console.error(`[OBS chapter marker] WebSocket error connecting to ${url}. Is OBS running with obs-websocket enabled on this port?`, event);
		try { ws.close(); } catch (_) { /* ignore */ }
	};
	if (options.probeStatus) {
		ws.onclose = (event) => {
			if (event && !event.wasClean && event.code !== 1000) {
				console.warn(`[OBS chapter marker] WebSocket closed unexpectedly (code ${event.code}${event.reason ? ", " + event.reason : ""}).`);
			}
		};
	}
	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data);
			const op = msg.op;
			const d = msg.d || {};
			if (op === 0) {
				// Hello - send Identify (with optional auth)
				const identifyPayload: Record<string, any> = { rpcVersion: 1 };
				const auth = d.authentication;
				if (auth && auth.challenge && auth.salt && password) {
					window.api.obsAuth(password, auth.salt, auth.challenge)
						.then((authentication) => {
							if (ws.readyState !== WebSocket.OPEN) return;
							identifyPayload.authentication = authentication;
							ws.send(JSON.stringify({ op: 1, d: identifyPayload }));
						})
						.catch(() => {
							// Same as the legacy `catch {}`: identify unauthenticated and let
							// OBS reject it, rather than never identifying at all.
							if (ws.readyState !== WebSocket.OPEN) return;
							ws.send(JSON.stringify({ op: 1, d: identifyPayload }));
						});
					return;
				}
				ws.send(JSON.stringify({ op: 1, d: identifyPayload }));
			} else if (op === 2 && options.probeStatus) {
				// Identified - first probe recording state, then send CreateRecordChapter
				ws.send(JSON.stringify({
					op: 6,
					d: {
						requestId: "status-" + requestId,
						requestType: "GetRecordStatus",
						requestData: {},
					},
				}));
			} else if ((op === 2) || (op === 7 && d.requestId === "status-" + requestId)) {
				if (op === 7) {
					const rd = d.responseData || {};
					console.log(`[OBS chapter marker] GetRecordStatus: active=${rd.outputActive}, paused=${rd.outputPaused}, timecode=${rd.outputTimecode}, bytes=${rd.outputBytes}`);
				}
				// Identified - send CreateRecordChapter
				ws.send(JSON.stringify({
					op: 6,
					d: {
						requestId: requestId,
						requestType: "CreateRecordChapter",
						requestData: { chapterName: String(chapterName) },
					},
				}));
			} else if (op === 7 && d.requestId === requestId) {
				if (options.probeStatus) {
					const status = d.requestStatus || {};
					if (!status.result) {
						const codeHint = status.code === 702
							? " (702 OutputNotRunning — start recording first)"
							: status.code === 604
							? " (604 RequestProcessingFailed — recording format may not support chapters; use Hybrid MP4)"
							: status.code === 501
							? " (501 UnsupportedRequestType — OBS version too old, or recording format does not support chapter markers; use Hybrid MP4)"
							: "";
						console.error(`[OBS chapter marker] CreateRecordChapter failed: code ${status.code}${codeHint}${status.comment ? " - " + status.comment : ""}`);
					} else {
						console.log(`[OBS chapter marker] CreateRecordChapter accepted by OBS (code ${status.code}). If no marker appears in the file, the recording format does not support chapters — switch Settings → Output → Recording → Recording Format to "Hybrid MP4".`);
					}
				}
				try { ws.close(); } catch (_) { /* ignore */ }
			} else if (op === 5 && options.probeStatus) {
				// OpCode 5 = Identify failure (wrong password, etc.)
				console.error("[OBS chapter marker] OBS rejected Identify (likely wrong password or rpcVersion mismatch).");
				try { ws.close(); } catch (_) { /* ignore */ }
			}
		} catch (_) { /* ignore */ }
	};
}
