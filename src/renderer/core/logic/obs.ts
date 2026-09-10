import { LocalStorageProxy } from "~/logic/LocalStorageProxy";

/**
 * Send an OBS WebSocket 5 "CreateRecordChapter" request (Add Chapter Marker).
 * Connects to ws://localhost:4455 (or the `obs_websocket_url` value in local storage), identifies, sends the
 * chapter name, then closes. Fails silently if OBS is not running.
 * Optional: set `obs_websocket_password` in local storage if OBS has authentication enabled.
 *
 * The sha256 pair for the authentication challenge is computed in the main process
 * (`obs:auth`) instead of `require("crypto")` here (plan 1.6). That makes Identify
 * asynchronous, so the socket may be gone by the time the digest comes back -- hence the
 * readyState check before sending.
 *
 * @param chapterName Name for the chapter marker (e.g. "RESET", "IN - BROCK")
 */
export function sendObsChapterMarker(chapterName: string): void {
	const url = (LocalStorageProxy.obs_websocket_url as string | null) || "ws://localhost:4455";
	const password = (LocalStorageProxy.obs_websocket_password as string | null) || null;
	const requestId = "chapter-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
	let ws: WebSocket;
	try {
		ws = new WebSocket(url);
	} catch (e) {
		return;
	}
	ws.onerror = () => { try { ws.close(); } catch (_) { /* ignore */ } };
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
			} else if (op === 2) {
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
				try { ws.close(); } catch (_) { /* ignore */ }
			}
		} catch (_) { /* ignore */ }
	};
}
