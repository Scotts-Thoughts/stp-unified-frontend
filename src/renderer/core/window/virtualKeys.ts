/**
 * gen5's second-screen toggle: `keyhook.sendVirtualKey(0x83)` / `0x84`, which called
 * node-key-sender from the renderer (decision 9: ported behind the feature, and marked
 * "probably broken" -- node-key-sender expects a key *name* and needs Java). The call
 * goes to the main process now, which holds the dependency; a renderer bundled by Vite
 * cannot `require` a package that ships a .jar. Fire and forget, as the legacy method
 * was, and its errors are logged there.
 */
export function sendVirtualKey(keyName: string | number): void {
    window.api.send_virtual_key(keyName);
}
