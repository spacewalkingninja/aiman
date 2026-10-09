#!/usr/bin/env bun
/**
 * aiman — cross-platform launcher.
 *
 * Starts the opencode sessions manager (Bun HTTP server) and, unless
 * disabled, an `opencode serve` instance it talks to. Works on Linux,
 * macOS and Windows wherever Bun is installed.
 *
 * Usage:
 *   aiman [--host 127.0.0.1] [--port 4097] [--opencode-port 4096]
 *         [--no-opencode] [--build] [--open] [--help] [--version]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SERVER_ENTRY = join(ROOT, "server", "src", "index.ts");
const DIST_INDEX = join(ROOT, "dist", "index.html");
const WEB_DIR = join(ROOT, "web");

const args = process.argv.slice(2);
const has = (...names) => names.some((n) => args.includes(n));
const valueOf = (name, fallback) => {
  const i = args.findIndex((a) => a === name || a.startsWith(name + "="));
  if (i === -1) return fallback;
  const a = args[i];
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return args[i + 1] ?? fallback;
};

if (has("-h", "--help")) {
  console.log(`aiman — opencode sessions manager

Usage: aiman [options]

Options:
  --host <host>            bind host            (default 127.0.0.1)
  --port <port>            http port            (default 4097)
  --opencode-port <port>   opencode serve port  (default 4096)
  --opencode-url <url>     use an existing opencode server (implies --no-opencode)
  --no-opencode            do not start opencode serve
  --build                  rebuild the web UI before starting
  --open                   open the UI in the default browser
  --version                print version
  --help                   show this help

Environment:
  AIMAN_HOME     data directory (default: platform data dir /aiman)
  OPENCODE_DB    opencode SQLite database
  OPENCODE_AUTH  opencode auth.json
  DIST           built web UI directory
  TERMINAL_URL   optional pyxtermjs terminal backend
`);
  process.exit(0);
}

if (has("-v", "--version")) {
  const pkg = JSON.parse(await Bun.file(join(ROOT, "package.json")).text());
  console.log(pkg.version ?? "0.0.0");
  process.exit(0);
}

function which(cmd) {
  try {
    return globalThis.Bun?.which?.(cmd) ?? null;
  } catch {
    return null;
  }
}

function findBun() {
  if (process.versions?.bun) return process.execPath;
  return (
    process.env.BUN_PATH ||
    which("bun") ||
    join(homedir(), ".bun", "bin", process.platform === "win32" ? "bun.exe" : "bun")
  );
}

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT, ...opts });
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
    child.on("error", rej);
  });
}

const winQuote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/**
 * Spawn an external program. On Windows, npm-installed CLIs are `.cmd` shims
 * that Node/Bun cannot spawn directly (EINVAL), so run them through the shell
 * with proper quoting instead.
 */
function spawnExternal(cmd, cmdArgs, opts = {}) {
  const isShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
  if (isShim) {
    const line = [winQuote(cmd), ...cmdArgs.map(winQuote)].join(" ");
    return spawn(line, { shell: true, ...opts });
  }
  return spawn(cmd, cmdArgs, opts);
}

async function buildWeb(bun) {
  if (!existsSync(WEB_DIR)) return;
  console.log(">> installing web dependencies…");
  await run(bun, ["install"], { cwd: WEB_DIR });
  console.log(">> building web UI…");
  await run(bun, ["run", "build"], { cwd: WEB_DIR });
}

async function isUp(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1200) });
    return true;
  } catch {
    return false;
  }
}

const host = valueOf("--host", process.env.HOST || "127.0.0.1");
const port = String(valueOf("--port", process.env.PORT || "4097"));
const opencodePort = String(valueOf("--opencode-port", process.env.OPENCODE_PORT || "4096"));
const opencodeUrl = valueOf("--opencode-url", process.env.OPENCODE_URL || `http://127.0.0.1:${opencodePort}`);
const startOpencode = !has("--no-opencode") && !has("--opencode-url") && !process.env.OPENCODE_URL;

if (!existsSync(SERVER_ENTRY)) {
  console.error(`Cannot find server entry: ${SERVER_ENTRY}`);
  process.exit(1);
}

const bun = findBun();
if (!existsSync(bun) && bun !== process.execPath) {
  console.error(
    `Bun was not found. Install it from https://bun.sh then re-run aiman.\nLooked for: ${bun}`,
  );
  process.exit(1);
}

if (has("--build") || !existsSync(DIST_INDEX)) {
  try {
    await buildWeb(bun);
  } catch (e) {
    console.error(`Web build failed: ${e.message}`);
    if (!existsSync(DIST_INDEX)) process.exit(1);
  }
}

const children = [];

let opencodeChild = null;
if (startOpencode) {
  if (await isUp(opencodeUrl)) {
    console.log(`>> using opencode server at ${opencodeUrl}`);
  } else {
    const oc = which("opencode");
    if (!oc) {
      console.warn(
        ">> opencode CLI not found — start `opencode serve` yourself or install it from https://opencode.ai",
      );
    } else {
      console.log(`>> starting opencode serve on port ${opencodePort}…`);
      try {
        opencodeChild = spawnExternal(
          oc,
          ["serve", "--port", opencodePort, "--hostname", "127.0.0.1"],
          { stdio: "inherit", cwd: process.cwd() },
        );
        children.push(opencodeChild);
        for (let i = 0; i < 30; i++) {
          if (await isUp(opencodeUrl)) break;
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (e) {
        console.warn(
          `>> could not start opencode (${e.message}). Start \`opencode serve\` yourself; aiman will keep running.`,
        );
      }
    }
  }
}

const env = {
  ...process.env,
  HOST: host,
  PORT: port,
  OPENCODE_URL: opencodeUrl,
};

console.log(`\n>> aiman running at http://${host}:${port}\n`);
const server = spawn(bun, ["run", SERVER_ENTRY], { stdio: "inherit", cwd: ROOT, env });
children.push(server);

if (has("--open")) {
  const url = `http://${host}:${port}`;
  const openCmd =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(openCmd[0], openCmd[1], { stdio: "ignore", detached: true }).unref();
  } catch {}
}

function shutdown(code = 0) {
  for (const c of children) {
    try {
      c.kill();
    } catch {}
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
server.on("exit", (code) => shutdown(code ?? 0));
