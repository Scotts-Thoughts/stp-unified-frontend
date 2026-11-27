/**
 * Headless check of the 3DS starter write (games/gen6/logic/pk6.ts) inside a real emulator: a Super Shuckie replay
 * plays in a 3DS-capable replay worker that can also write memory, the party lead is decrypted, stamped, encrypted
 * and written exactly as the overlay does, and the replay then keeps playing so the game itself handles the Pokemon
 * (battles, level-ups, menus). It fails on any Bad Egg sign.
 *
 *   npx tsx --tsconfig tsconfig.web.json tools/gen6/starter-write-test.ts --worker <xpr-write-worker.exe>
 *        --replay <file> --rom <rom> --game xy|oras|sm|usum (scan [--step 600] | test --at <frame> [--run 20000]
 *        [--every 300] [--nature Modest] [--ivs 31,0,31,31,31,30] [--gender 1] (--slot 2 --ability-id N --base '{..}'
 *        | --ability <name> [--become <species>] [--species <name>]: the overlay's own writeStarter with the game's
 *          Pokedex; --become makes the lead that species, as the Solo Pokemon setting does)
 *        | mapper --pab <pab-host.exe> --mapper STANDARD/gen6/pokemon_x_y.xml [--at <frame>])
 *
 * `mapper` checks the mapper side: Poke-A-Byte's own engine (pab-host) loads the mapper on the worker's memory and
 * `player.encrypted_mon_0` / `_stats` must sit at the lead's address and serve the same bytes memory holds, which
 * decrypt to the same Pokemon as the mapper's `player.team.0`.
 *
 * The worker is the Router's xpr-replay-worker with three test commands added (`goto <frame>`, `read <hex addr> <n>`,
 * `write <hex addr> <hex bytes>`), built with the Nintendo3DS core (docs/gen6-inventory.md, "Writing the starter").
 *
 * What `test` checks:
 *   1. Round trip on the game's own bytes: decrypt then encrypt gives back exactly what memory holds, and the
 *      checksum adds up (the block shuffle, the XOR and the checksum all agree with the game's).
 *   2. The write: memory read straight after it holds exactly the bytes written; they decrypt with a good checksum
 *      to the stamped values.
 *   3. The game's own handling: the replay keeps playing; every `--every` frames the lead is read again. The
 *      checksum must add up, the sanity word stay 0, the egg bit stay clear and the stamped nature, ability,
 *      gender and IVs stay; when the game writes the Pokemon itself (exp, HP or level change), that is reported,
 *      because a write by the game that keeps the stamp is the proof it accepted the Pokemon.
 */
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { checksumOk, decrypt, encrypt, readFields, stampStarter, matchesStamp, toHex, RAM_STATS_OFFSET, STORED_SIZE, PARTY_STATS_SIZE, type StarterStamp } from "../../src/renderer/games/gen6/logic/pk6";
import { stampFor, writeStarter } from "../../src/renderer/games/gen6/starterWrite";
import * as naturesModule from "../../src/renderer/games/gen6/data/natures.js";

const natures: Record<string, any> = (naturesModule as any).natures ?? (naturesModule as any).default?.natures;

const PARTY_BASE: Record<string, number> = { xy: 0x08ce1ce8, oras: 0x08cf727c, sm: 0x34195e10, usum: 0x33f7fa44 };
/** The mappers' battle test: a pointer at `flag` into [lo, hi) while a battle is on. */
const BATTLE: Record<string, [number, number, number]> = {
    xy: [0x08000140, 0x081fb000, 0x08209000],
    oras: [0x08000140, 0x081fb000, 0x08209000],
    sm: [0x3417f98c, 0x32580000, 0x32584000],
    usum: [0x30000400, 0x32580000, 0x32584000],
};

const argv = process.argv.slice(2);
const mode = argv.find((a) => a === "scan" || a === "test" || a === "mapper") ?? "scan";
const opt = (name: string, fallback?: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
};
const game = opt("game", "xy")!;
const base = PARTY_BASE[game];
if (base === undefined) throw new Error(`--game must be one of ${Object.keys(PARTY_BASE).join(", ")}`);

class Worker {
    p: ChildProcessWithoutNullStreams;
    buf = Buffer.alloc(0);
    waiters: ((m: Buffer | null) => void)[] = [];
    msgs: Buffer[] = [];
    constructor(exe: string, args: string[]) {
        this.p = spawn(exe, args, { stdio: ["pipe", "pipe", "pipe"] });
        this.p.stderr.on("data", (d) => { if (process.env.WORKER_DEBUG) process.stderr.write(d); });
        this.p.stdout.on("data", (d: Buffer) => {
            this.buf = Buffer.concat([this.buf, d]);
            while (this.buf.length >= 4) {
                const n = this.buf.readUInt32LE(0);
                if (this.buf.length < 4 + n) break;
                const m = this.buf.subarray(4, 4 + n);
                this.buf = this.buf.subarray(4 + n);
                const w = this.waiters.shift();
                if (w) w(m); else this.msgs.push(m);
            }
        });
        this.p.on("exit", () => { for (const w of this.waiters) w(null); });
    }
    next(): Promise<Buffer> {
        if (this.msgs.length) return Promise.resolve(this.msgs.shift()!);
        return new Promise((res, rej) => this.waiters.push((m) => (m ? res(m) : rej(new Error("worker exited")))));
    }
    async cmd(line: string): Promise<Buffer> {
        this.p.stdin.write(line + "\n");
        return this.next();
    }
    async json(line: string): Promise<any> {
        const m = await this.cmd(line);
        if (m[0] !== 0x4a) throw new Error(`unexpected answer to ${line}`);
        const j = JSON.parse(m.subarray(1).toString());
        if (j.error) throw new Error(`${line}: ${j.error}`);
        return j;
    }
    async read(addr: number, n: number): Promise<number[]> {
        const m = await this.cmd(`read ${addr.toString(16)} ${n}`);
        if (m[0] !== 0x52 || m[1] !== 1) throw new Error(`read ${addr.toString(16)} failed`);
        return [...m.subarray(2)];
    }
    async write(addr: number, bytes: number[]): Promise<void> {
        const j = await this.json(`write ${addr.toString(16)} ${toHex(bytes)}`);
        if (!j.wrote || j.length !== bytes.length) throw new Error(`write ${addr.toString(16)} failed`);
    }
    async goto(frame: number): Promise<boolean> {
        return (await this.json(`goto ${frame}`)).ok;
    }
    quit() { try { this.p.stdin.write("quit\n"); } catch { /* gone */ } }
}

const POKEDEX_FILE: Record<string, string> = { xy: "x_y", oras: "omega_ruby_alpha_sapphire", sm: "sun_moon", usum: "ultra_sun_ultra_moon" };
async function loadPokedex(): Promise<Record<string, any>> {
    const m: any = await import(`../../src/renderer/games/gen6/data/pokedex/${POKEDEX_FILE[game]}.js`);
    return m.pokedex ?? m.default?.pokedex;
}

async function readLead(w: Worker) {
    const stored = await w.read(base, STORED_SIZE);
    const stats = await w.read(base + RAM_STATS_OFFSET, PARTY_STATS_SIZE);
    return { stored, stats, dec: decrypt(stored, stats) };
}

async function inBattle(w: Worker): Promise<boolean> {
    const [flag, lo, hi] = BATTLE[game];
    const b = await w.read(flag, 4);
    const ptr = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    return ptr >= lo && ptr < hi;
}

function describe(dec: Uint8Array) {
    const f = readFields(dec);
    const iv = f.ivs;
    return `species ${f.species} lv ${f.level} nature ${f.nature} ability ${f.ability}#${f.abilityNumber} gender ${f.gender} ` +
        `ivs ${iv.hp}/${iv.atk}/${iv.def}/${iv.spe}/${iv.spa}/${iv.spd} hp ${f.hp}/${f.stats.hp} atk ${f.stats.attack} def ${f.stats.defense} ` +
        `spe ${f.stats.speed} spa ${f.stats.special_attack} spd ${f.stats.special_defense} sanity ${f.sanity} egg ${f.isEgg} checksum ${checksumOk(dec) ? "ok" : "BAD"} ` +
        `exp ${(dec[0x10] | (dec[0x11] << 8) | (dec[0x12] << 16)) >>> 0} moves ${[0, 1, 2, 3].map((i) => dec[0x5a + 2 * i] | (dec[0x5b + 2 * i] << 8)).join(",")} ` +
        `name ${String.fromCharCode(...Array.from({ length: 12 }, (_, i) => dec[0x40 + 2 * i] | (dec[0x41 + 2 * i] << 8)).filter((c) => c))}`;
}

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => x === b[i]);

async function main() {
    const worker = opt("worker");
    const replay = opt("replay");
    const rom = opt("rom");
    if (!worker || !replay || !rom) throw new Error("--worker, --replay and --rom are needed");
    const info = JSON.parse(execFileSync(worker, ["--replay", replay, "--info"], { encoding: "utf8" }));
    const total: number = info.total_frames;
    console.log(`${replay}: ${info.console} ${info.rom_name}, ${total} frames`);
    const w = new Worker(worker, ["--replay", replay, "--rom", rom, "--allow-mismatch"]);
    const ready = await w.next();
    if (ready[0] !== 0x4a) throw new Error("worker did not start");

    if (mode === "mapper") {
        const at = Number(opt("at", "1"));
        const pab = new Worker(opt("pab")!, ["--mappers", opt("mappers", process.env.APPDATA + "/PokeAByte/Mappers")!, "--mapper", opt("mapper")!, "--compact"]);
        const hello = JSON.parse((await pab.next()).toString());
        if (hello.error) throw new Error(hello.error);
        await w.json("blocks " + hello.blocks.map(([s0, l]: [number, number]) => s0 + ":" + l).join(","));
        w.p.stdin.write(`job 1 d ${at} ${at} 1
`);
        let snap: Buffer | null = null;
        for (;;) {
            const m = await w.next();
            if (m[0] === 0x45) break;
            if (m[0] === 0x44) snap = m;
        }
        if (!snap) throw new Error("no snapshot");
        const sPacket = Buffer.alloc(1 + snap.length - 17);
        sPacket[0] = 0x53;
        snap.copy(sPacket, 1, 17);
        pab.p.stdin.write(sPacket);
        await pab.next();
        pab.p.stdin.write(Buffer.from("M"));
        const mapper = JSON.parse((await pab.next()).toString());
        const prop = (path: string) => mapper.properties.find((p: any) => p.path === path);
        const stored = prop("player.encrypted_mon_0");
        const stats = prop("player.encrypted_mon_0_stats");
        const memStored = await w.read(base, STORED_SIZE);
        const memStats = await w.read(base + RAM_STATS_OFFSET, PARTY_STATS_SIZE);
        let failures = 0;
        const check = (ok: boolean, what: string) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures++; };
        check(stored?.address === base && stats?.address === base + RAM_STATS_OFFSET, `addresses ${stored?.address?.toString(16)} / ${stats?.address?.toString(16)}`);
        check(same(stored?.bytes ?? [], memStored) && same(stats?.bytes ?? [], memStats), "the properties' bytes are what memory holds");
        const dec = readFields(decrypt(stored.bytes, stats.bytes));
        const species = prop("player.team.0.species")?.value;
        const level = prop("player.team.0.level")?.value;
        const nature = prop("player.team.0.nature")?.value;
        const hp = prop("player.team.0.stats.hp_max")?.value;
        console.log(`  mapper team.0: ${species} lv ${level} ${nature} max HP ${hp}; decrypted: species ${dec.species} lv ${dec.level} nature ${dec.nature} max HP ${dec.stats.hp}`);
        check(level === dec.level && hp === dec.stats.hp, "decrypting them gives the mapper's player.team.0");
        pab.p.stdin.write(Buffer.from("Q"));
        w.quit();
        process.exit(failures ? 1 : 0);
    }

    if (mode === "scan") {
        const step = Number(opt("step", "600"));
        let last = "";
        for (let f = 1; f < total; f += step) {
            if (!(await w.goto(f))) break;
            const { dec } = await readLead(w);
            const ec = readFields(dec).ec;
            const line = (await inBattle(w) ? "[battle] " : "[overworld] ") + (ec === 0 ? "no Pokemon" : describe(dec));
            if (line !== last) console.log(`frame ${f}: ${line}`);
            last = line;
        }
        w.quit();
        return;
    }

    const at = Number(opt("at"));
    const runFor = Number(opt("run", "20000"));
    const every = Number(opt("every", "300"));
    if (!(await w.goto(at))) throw new Error(`replay ends before frame ${at}`);
    const before = await readLead(w);
    if (readFields(before.dec).ec === 0) throw new Error(`no Pokemon in the lead slot at frame ${at}`);
    const battleAtWrite = await inBattle(w);
    console.log(`frame ${at} (${battleAtWrite ? "in battle" : "overworld"}) as the game has it: ${describe(before.dec)}`);

    let failures = 0;
    const check = (ok: boolean, what: string) => {
        console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
        if (!ok) failures++;
    };

    // 1. Round trip on the game's own bytes
    const again = encrypt(before.dec);
    check(checksumOk(before.dec), "the game's checksum adds up under our decryption");
    check(same(again.stored, before.stored), "encrypt(decrypt(stored)) is byte for byte what memory holds (232 bytes)");
    check(same(again.stats, before.stats), "encrypt(decrypt(party stats)) is byte for byte what memory holds (28 bytes)");

    // 2. The write
    const natureName = opt("nature", "Modest")!;
    const nature = (natures as any)[natureName];
    const ivList = (opt("ivs", "31,0,31,31,31,30")!).split(",").map(Number);
    const ivs = { hp: ivList[0], atk: ivList[1], def: ivList[2], spe: ivList[3], spa: ivList[4], spd: ivList[5] };
    const slot = Number(opt("slot", "2")) as 0 | 1 | 2;
    const f0 = readFields(before.dec);
    const stamp: StarterStamp = {
        nature: nature.modulo_value,
        natureMods: nature,
        abilityId: Number(opt("ability-id", String(f0.ability))),
        abilitySlot: slot,
        gender: Number(opt("gender", "1")) as 0 | 1 | 2,
        ivs,
        baseStats: JSON.parse(opt("base", "null")!) ?? (opt("ability") ? {} : (() => { throw new Error("--base '{\"hp\":..}' (the species' base stats) is needed, or --ability <name> for the overlay's path"); })()),
    };
    let stamped = stampStarter(before.dec, stamp);
    let out = encrypt(stamped);
    if (opt("ability")) {
        // --ability <name>: the overlay's own write path (games/gen6/starterWrite.ts), with this game's real Pokedex,
        // through a stand-in for the mapper's two properties that reads and writes the emulator.
        const movesModule: any = await import(game === "xy" || game === "oras" ? "../../src/renderer/games/gen6/data/moves_gen6.js" : "../../src/renderer/games/gen6/data/moves_gen7.js");
        const tables = { pokedex: await loadPokedex(), moves: movesModule.moves ?? movesModule.default?.moves } as any;
        const choice = { species: opt("become") ?? null, nature: natureName, ability: opt("ability")!, gender: (opt("gender", "1") === "0" ? "Male" : "Female") as "Male" | "Female", ivs };
        const built = stampFor(tables, natures, before.dec, choice, opt("species") ?? null);
        if ("error" in built) throw new Error(built.error);
        Object.assign(stamp, built.stamp);
        stamped = stampStarter(before.dec, stamp);
        out = encrypt(stamped);
        let cache = { stored: before.stored, stats: before.stats };
        const props = {
            battle: { in_battle: { value: await inBattle(w) } },
            player: {
                encrypted_mon_0: {
                    get bytes() { return cache.stored; },
                    setBytes: async (b: number[]) => { await w.write(base, b); cache = { ...cache, stored: await w.read(base, STORED_SIZE) }; },
                },
                encrypted_mon_0_stats: {
                    get bytes() { return cache.stats; },
                    setBytes: async (b: number[]) => { await w.write(base + RAM_STATS_OFFSET, b); cache = { ...cache, stats: await w.read(base + RAM_STATS_OFFSET, PARTY_STATS_SIZE) }; },
                },
            },
        };
        const outcome = await writeStarter({ props, tables, natures, choice, preferred: opt("species") ?? null, timeoutMs: 500 });
        console.log(`overlay write (${built.entry.species}): ${outcome.ok ? "ok" : "not written"}: ${outcome.message}`);
        check(outcome.ok, "the overlay's writeStarter wrote and read the Pokemon back");
    } else {
        await w.write(base, out.stored);
        await w.write(base + RAM_STATS_OFFSET, out.stats);
    }
    const after = await readLead(w);
    check(same(after.stored, out.stored) && same(after.stats, out.stats), "memory read back straight after the write holds exactly the bytes written");
    check(checksumOk(after.dec), "the written Pokemon's checksum adds up");
    check(matchesStamp(after.dec, stamp), "it decrypts to the stamped nature, ability, gender, IVs and stats");
    console.log(`written: ${describe(after.dec)}`);

    // 3. The game's own handling
    const want = readFields(stamped);
    let prev = after;
    let gameWrites = 0;
    let lastFrame = at;
    let battle = battleAtWrite;
    let battlesSeen = 0;
    for (let f = at + every; f <= Math.min(total - 1, at + runFor); f += every) {
        if (!(await w.goto(f))) break;
        lastFrame = f;
        const nowBattle = await inBattle(w);
        if (nowBattle !== battle) {
            console.log(`frame ${f}: battle ${nowBattle ? "starts" : "ends"}`);
            if (nowBattle) battlesSeen++;
            battle = nowBattle;
        }
        const cur = await readLead(w);
        const c = readFields(cur.dec);
        if (c.ec === 0) { console.log(`frame ${f}: lead slot empty`); continue; }
        const changed = !same(cur.stored, prev.stored) || !same(cur.stats, prev.stats);
        if (changed) {
            gameWrites++;
            console.log(`frame ${f} (${await inBattle(w) ? "in battle" : "overworld"}): the game changed the Pokemon: ${describe(cur.dec)}`);
            const keep = c.nature === want.nature && c.ability === want.ability && c.abilityNumber === want.abilityNumber && c.gender === want.gender
                && JSON.stringify(c.ivs) === JSON.stringify(want.ivs);
            check(checksumOk(cur.dec) && c.sanity === 0 && !c.isEgg && c.species === want.species, `frame ${f}: still a good Pokemon (checksum, sanity 0, not an egg, same species)`);
            check(keep, `frame ${f}: nature, ability, gender and IVs are still the stamped ones`);
        } else if (!checksumOk(cur.dec)) {
            check(false, `frame ${f}: checksum`);
        }
        prev = cur;
    }
    console.log(`played to frame ${lastFrame}; ${battlesSeen} battle(s) started; the game rewrote the Pokemon ${gameWrites} time(s) after the stamp`);
    console.log(failures ? `${failures} check(s) FAILED` : "all checks passed");
    w.quit();
    process.exit(failures ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
