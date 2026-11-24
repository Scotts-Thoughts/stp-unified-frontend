import { existsSync, rmSync } from "fs";
import { join } from "path";
import { ipcMain } from "electron";
import { resolveInside, userDataRoot } from "./paths";
import { getFromRouter, ROUTER_DEFAULT_PORT } from "./routerFetch";

/** The router fetch (routerFetch.ts) and the profile files' delete, for core/profile/. */
export function registerRouterIpc(): void {
  ipcMain.handle("router:get", (_e, path: string, port?: number) =>
    getFromRouter(path, typeof port === "number" && port > 0 && port < 65536 ? port : ROUTER_DEFAULT_PORT),
  );
  // Player profiles (core/profile/): "Delete" removes the profile's own file, and nothing
  // outside `data/profiles/` can be removed this way.
  ipcMain.handle("profiles:remove", (_e, id: string) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`not a profile id: ${id}`);
    const target = resolveInside(join(userDataRoot(), "profiles"), `${id}.json`);
    if (existsSync(target)) rmSync(target);
  });
}
