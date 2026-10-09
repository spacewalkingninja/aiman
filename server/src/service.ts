import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { APP_ROOT, HOST, PORT } from "./config";

const LABEL = "com.aiman.manager";
const LAUNCHER = join(APP_ROOT, "bin", "aiman.mjs");
const BUN = process.execPath;

export type ServiceStatus = {
  platform: string;
  manager: "systemd" | "launchd" | "schtasks" | null;
  installed: boolean;
  path: string | null;
  detail?: string;
};

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    const proc = Bun.spawnSync([cmd, ...args]);
    return { ok: proc.success, out: proc.stdout.toString() + proc.stderr.toString() };
  } catch (e) {
    return { ok: false, out: String(e) };
  }
}

// ---- Linux (systemd) ----
const SYSTEMD_SYSTEM = "/etc/systemd/system/aiman.service";
const SYSTEMD_USER = join(homedir(), ".config", "systemd", "user", "aiman.service");

function systemdUnit(): string {
  return `[Unit]
Description=aiman - opencode sessions manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_ROOT}
Environment=HOME=${homedir()}
Environment=HOST=${HOST}
Environment=PORT=${PORT}
ExecStart="${BUN}" "${LAUNCHER}" --host ${HOST} --port ${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
}

function sudoAvailable(): boolean {
  return run("sudo", ["-n", "true"]).ok;
}

// ---- macOS (launchd) ----
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

function plistBody(): string {
  const log = join(homedir(), "Library", "Logs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${BUN}</string><string>${LAUNCHER}</string><string>--host</string><string>${HOST}</string><string>--port</string><string>${PORT}</string></array>
  <key>WorkingDirectory</key><string>${APP_ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(log, "aiman.out.log")}</string>
  <key>StandardErrorPath</key><string>${join(log, "aiman.err.log")}</string>
</dict></plist>
`;
}

export function serviceStatus(): ServiceStatus {
  if (process.platform === "linux") {
    const sys = existsSync(SYSTEMD_SYSTEM);
    const usr = existsSync(SYSTEMD_USER);
    return {
      platform: "linux",
      manager: "systemd",
      installed: sys || usr,
      path: sys ? SYSTEMD_SYSTEM : usr ? SYSTEMD_USER : SYSTEMD_SYSTEM,
      detail: sys ? "system service" : usr ? "user service" : undefined,
    };
  }
  if (process.platform === "darwin") {
    return { platform: "darwin", manager: "launchd", installed: existsSync(PLIST), path: PLIST };
  }
  if (process.platform === "win32") {
    const q = run("schtasks", ["/Query", "/TN", "aiman"]);
    return { platform: "win32", manager: "schtasks", installed: q.ok, path: "Task Scheduler: aiman" };
  }
  return { platform: process.platform, manager: null, installed: false, path: null };
}

export async function installService(): Promise<{ ok: boolean; detail: string }> {
  try {
    if (process.platform === "linux") {
      if (sudoAvailable()) {
        const tmp = "/tmp/aiman.service";
        await Bun.write(tmp, systemdUnit());
        const cp = run("sudo", ["-n", "cp", tmp, SYSTEMD_SYSTEM]);
        if (!cp.ok) return { ok: false, detail: `copy failed: ${cp.out}` };
        run("sudo", ["-n", "systemctl", "daemon-reload"]);
        const en = run("sudo", ["-n", "systemctl", "enable", "--now", "aiman"]);
        return { ok: en.ok, detail: en.ok ? "installed system service" : en.out };
      }
      // no sudo: user service
      mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
      await Bun.write(SYSTEMD_USER, systemdUnit().replace("WantedBy=default.target", "WantedBy=default.target"));
      run("systemctl", ["--user", "daemon-reload"]);
      const en = run("systemctl", ["--user", "enable", "--now", "aiman"]);
      run("loginctl", ["enable-linger", userInfo().username]);
      return { ok: en.ok, detail: en.ok ? "installed user service" : en.out };
    }
    if (process.platform === "darwin") {
      mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
      mkdirSync(join(homedir(), "Library", "Logs"), { recursive: true });
      await Bun.write(PLIST, plistBody());
      run("launchctl", ["unload", PLIST]);
      const load = run("launchctl", ["load", PLIST]);
      return { ok: load.ok, detail: load.ok ? "installed launch agent" : load.out };
    }
    if (process.platform === "win32") {
      const tr = `"${BUN}" "${LAUNCHER}" --host ${HOST} --port ${PORT}`;
      const create = run("schtasks", ["/Create", "/TN", "aiman", "/SC", "ONLOGON", "/RL", "LIMITED", "/F", "/TR", tr]);
      if (!create.ok) return { ok: false, detail: create.out };
      run("schtasks", ["/Run", "/TN", "aiman"]);
      return { ok: true, detail: "installed scheduled task (runs at logon)" };
    }
    return { ok: false, detail: "unsupported platform" };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

export async function uninstallService(): Promise<{ ok: boolean; detail: string }> {
  try {
    if (process.platform === "linux") {
      if (sudoAvailable() && existsSync(SYSTEMD_SYSTEM)) {
        run("sudo", ["-n", "systemctl", "disable", "--now", "aiman"]);
        run("sudo", ["-n", "rm", "-f", SYSTEMD_SYSTEM]);
        run("sudo", ["-n", "systemctl", "daemon-reload"]);
        return { ok: true, detail: "removed system service" };
      }
      run("systemctl", ["--user", "disable", "--now", "aiman"]);
      try {
        rmSync(SYSTEMD_USER, { force: true });
      } catch {}
      run("systemctl", ["--user", "daemon-reload"]);
      return { ok: true, detail: "removed user service" };
    }
    if (process.platform === "darwin") {
      run("launchctl", ["unload", PLIST]);
      try {
        rmSync(PLIST, { force: true });
      } catch {}
      return { ok: true, detail: "removed launch agent" };
    }
    if (process.platform === "win32") {
      const del = run("schtasks", ["/Delete", "/TN", "aiman", "/F"]);
      return { ok: del.ok, detail: del.ok ? "removed scheduled task" : del.out };
    }
    return { ok: false, detail: "unsupported platform" };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

/**
 * Restart the manager so newly applied code takes effect. Under systemd/launchd
 * we exit and let the supervisor bring us back; otherwise we relaunch ourselves
 * detached.
 */
export function restartSelf(): void {
  const underSupervisor =
    !!process.env.INVOCATION_ID || // systemd
    process.env.XPC_SERVICE_NAME === LABEL || // launchd
    !!process.env.AIMAN_SERVICE;
  if (underSupervisor) {
    setTimeout(() => process.exit(1), 300);
    return;
  }
  try {
    if (process.platform === "win32") {
      const line = `timeout /t 2 >nul & "${BUN}" "${LAUNCHER}" --host ${HOST} --port ${PORT}`;
      spawn("cmd.exe", ["/c", line], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } else {
      const line = `sleep 2; exec "${BUN}" "${LAUNCHER}" --host ${HOST} --port ${PORT}`;
      spawn("/bin/sh", ["-c", line], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {}
  setTimeout(() => process.exit(0), 400);
}
