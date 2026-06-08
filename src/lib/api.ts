// Typed wrappers around the Rust commands. Tool paths are sent as overrides:
// an empty string tells the Rust side to use the bundled sidecar. The override
// is only honored when the user opted into their own binaries.

import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./settings";

// Effective tool override: blank unless the user enabled their own binaries.
const mp = (s: Settings) => (s.useOwnBinaries ? s.mpremote : "");
const esp = (s: Settings) => (s.useOwnBinaries ? s.esptool : "");
const mpy = (s: Settings) => (s.useOwnBinaries ? s.mpyCross : "");

// The serial port is exclusive: overlapping mpremote/esptool calls corrupt each
// other (e.g. a detection probe running during a snapshot wrongly reports "no
// MicroPython"). Run every device/serial command one at a time, in order.
let serialChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = serialChain.then(fn, fn);
  serialChain = next.then(
    () => {},
    () => {}
  );
  return next;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  // Device snapshot only: prefetched text content, and whether the file is
  // viewable at all (false for binary/.mpy). Absent for local files.
  content?: string;
  readable?: boolean;
}

export interface PortInfo {
  port: string;
  description: string;
  likely_esp: boolean;
}

// ---- local filesystem ----
export const readDir = (path: string) =>
  invoke<FileNode[]>("read_dir", { path });

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

// ---- device (all serialized via the queue above) ----
export const listPorts = (s: Settings) =>
  serial(() => invoke<PortInfo[]>("list_ports", { mpremote: mp(s) }));

export const deviceTree = (s: Settings): Promise<FileNode[]> =>
  serial(() =>
    invoke<string>("device_tree", { mpremote: mp(s), port: s.port }).then(
      (json) => (json ? (JSON.parse(json) as FileNode[]) : [])
    )
  );

export const deviceRead = (s: Settings, path: string) =>
  serial(() => invoke<string>("device_read", { mpremote: mp(s), port: s.port, path }));

export const deviceDelete = (s: Settings, path: string) =>
  serial(() => invoke<string>("device_delete", { mpremote: mp(s), port: s.port, path }));

export const uploadFile = (s: Settings, local: string, remote?: string) =>
  serial(() =>
    invoke<string>("upload_file", {
      mpremote: mp(s),
      port: s.port,
      local,
      remote: remote ?? null,
    })
  );

export const runFile = (s: Settings, local: string) =>
  serial(() => invoke<string>("run_file", { mpremote: mp(s), port: s.port, local }));

export const resetDevice = (s: Settings) =>
  serial(() => invoke<string>("reset_device", { mpremote: mp(s), port: s.port }));

export interface DeviceInfo {
  micropython: boolean;
  version: string | null;
  machine: string | null;
  chip: string | null;
  suggested_offset: string | null;
}

export const detectDevice = (s: Settings) =>
  serial(() =>
    invoke<DeviceInfo>("detect_device", {
      mpremote: mp(s),
      esptool: esp(s),
      port: s.port,
    })
  );

export const uploadProject = (s: Settings) =>
  serial(() =>
    invoke<string>("upload_project", {
      mpremote: mp(s),
      mpyCross: mpy(s),
      port: s.port,
      dir: s.projectDir,
      compile: s.compileOnUpload,
    })
  );

// ---- firmware ----
// App-managed mode prioritizes reliability over speed: 115200 is esptool's
// default baud and works on essentially every board/cable (higher rates can
// crash esptool's flash-id step on some setups). Power users can override.
const AUTO_BAUD = "115200";
const flashBaud = (s: Settings) => (s.autoBaud ? AUTO_BAUD : s.baud);

export const flashFirmware = (s: Settings, binPath: string, erase: boolean) =>
  serial(() =>
    invoke<string>("flash_firmware", {
      args: {
        esptool: esp(s),
        port: s.port,
        bin_path: binPath,
        baud: flashBaud(s),
        offset: s.offset,
        erase,
      },
    })
  );

// ---- tool versions (for the About screen) ----
export interface ToolVersions {
  mpremote: string;
  mpy_cross: string;
  esptool: string;
}

// Bundled versions: from the build-time manifest, never launches a process.
export const bundledVersions = () => invoke<ToolVersions>("bundled_versions");

// The user's own binaries: queried live from the override paths (blank = "").
export const overrideVersions = (s: Settings) =>
  invoke<ToolVersions>("override_versions", {
    mpremote: s.mpremote,
    mpyCross: s.mpyCross,
    esptool: s.esptool,
  });

// ---- quick start ----
export const newProject = (args: {
  parent: string;
  name: string;
  template: string;
  git: boolean;
}) => invoke<string>("new_project", { args });
