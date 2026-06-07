// Typed wrappers around the Rust commands. Each device/tool call pulls the
// configured tool path from settings so binaries resolve regardless of PATH.

import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./settings";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export interface PortInfo {
  port: string;
  description: string;
}

// ---- local filesystem ----
export const readDir = (path: string) =>
  invoke<FileNode[]>("read_dir", { path });

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

// ---- device ----
export const listPorts = (s: Settings) =>
  invoke<PortInfo[]>("list_ports", { mpremote: s.mpremote });

export const deviceTree = (s: Settings): Promise<FileNode[]> =>
  invoke<string>("device_tree", { mpremote: s.mpremote, port: s.port }).then(
    (json) => (json ? (JSON.parse(json) as FileNode[]) : [])
  );

export const deviceRead = (s: Settings, path: string) =>
  invoke<string>("device_read", { mpremote: s.mpremote, port: s.port, path });

export const deviceDelete = (s: Settings, path: string) =>
  invoke<string>("device_delete", { mpremote: s.mpremote, port: s.port, path });

export const uploadFile = (s: Settings, local: string, remote?: string) =>
  invoke<string>("upload_file", {
    mpremote: s.mpremote,
    port: s.port,
    local,
    remote: remote ?? null,
  });

export const runFile = (s: Settings, local: string) =>
  invoke<string>("run_file", { mpremote: s.mpremote, port: s.port, local });

export const resetDevice = (s: Settings) =>
  invoke<string>("reset_device", { mpremote: s.mpremote, port: s.port });

export const uploadProject = (s: Settings) =>
  invoke<string>("upload_project", {
    mpremote: s.mpremote,
    python: s.python,
    port: s.port,
    dir: s.projectDir,
    compile: s.compileOnUpload,
  });

// ---- firmware ----
export const flashFirmware = (s: Settings, erase: boolean) =>
  invoke<string>("flash_firmware", {
    args: {
      esptool: s.esptool,
      port: s.port,
      bin_path: s.firmwarePath,
      baud: s.baud,
      offset: s.offset,
      erase,
    },
  });

// ---- quick start ----
export const newProject = (args: {
  parent: string;
  name: string;
  template: string;
  git: boolean;
}) => invoke<string>("new_project", { args });
